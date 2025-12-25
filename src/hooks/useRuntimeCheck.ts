import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";

export interface Dependency {
	name: string;
	download_size: string;
	installed_size: string;
}

export interface DependenciesCheckResult {
	dependencies: Dependency[];
	loading: boolean;
	error: string | null;
	processActive: boolean;
	queueInstallConfirmation: () => void;
}

/**
 * Custom hook to check what dependencies will be installed for an app
 * Uses persistent PTY process to read dependencies and keep process alive for installation
 * @param appId - The Flatpak application ID (e.g., "org.gnome.Builder")
 * @returns DependenciesCheckResult with list of dependencies, loading state, error, and process status
 */
export function useRuntimeCheck(appId: string): DependenciesCheckResult {
	const [dependencies, setDependencies] = useState<Dependency[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [processActive, setProcessActive] = useState(false);
	const [outputLines, setOutputLines] = useState<string[]>([]);
	const [_needsRuntimeResponse, setNeedsRuntimeResponse] = useState(false);
	const [pendingInstallConfirmation, setPendingInstallConfirmation] =
		useState(false);
	const [promptReady, setPromptReady] = useState(false);

	useEffect(() => {
		let unlistenOutput: (() => void) | null = null;
		let unlistenError: (() => void) | null = null;
		let unlistenTerminated: (() => void) | null = null;
		let runtimeResponseSent = false;
		let loadingTimeoutId: NodeJS.Timeout | null = null;

		const startProcess = async () => {
			try {
				setLoading(true);
				setError(null);

				// Safety timeout - if we don't detect prompt in 10 seconds, stop loading
				loadingTimeoutId = setTimeout(() => {
					console.log(
						"[useRuntimeCheck] Loading timeout reached, stopping spinner",
					);
					setLoading(false);
				}, 10000);

				// Listen to PTY output
				unlistenOutput = await listen<[string, string]>(
					"pty-output",
					(event) => {
						const [receivedAppId, line] = event.payload;
						if (receivedAppId === appId) {
							console.log("[useRuntimeCheck] PTY output:", line);
							setOutputLines((prev) => [...prev, line]);

							// Auto-respond to runtime question (only once)
							if (
								line.includes("Required runtime for") &&
								!runtimeResponseSent
							) {
								runtimeResponseSent = true;
								setNeedsRuntimeResponse(true);
								console.log("[useRuntimeCheck] Runtime detected, sending 'y'");
								// Send 'y' to accept runtime installation
								invoke("send_to_pty", { appId, input: "y" }).catch(
									console.error,
								);
							}

							// Detect when flatpak is waiting for install confirmation
							// Both cases: "Do you want to install it? [Y/n]:" or just showing the list
							if (
								line.includes("[Y/n]") ||
								line.includes("[y/N]") ||
								line.toLowerCase().includes("proceed with these changes")
							) {
								console.log(
									"[useRuntimeCheck] Install prompt detected, dependencies loaded",
								);
								if (loadingTimeoutId) clearTimeout(loadingTimeoutId);
								setLoading(false);
								setPromptReady(true);
							}
						}
					},
				);

				// Listen to PTY errors
				unlistenError = await listen<[string, string]>("pty-error", (event) => {
					const [receivedAppId, line] = event.payload;
					if (receivedAppId === appId) {
						setOutputLines((prev) => [...prev, line]);
					}
				});

				// Listen to process termination
				unlistenTerminated = await listen<string>("pty-terminated", (event) => {
					if (event.payload === appId) {
						setProcessActive(false);
						setLoading(false);
					}
				});

				// Start the interactive PTY process
				await invoke("start_flatpak_interactive", { appId });
				setProcessActive(true);
			} catch (err) {
				setError(String(err));
				setLoading(false);
				setProcessActive(false);
			}
		};

		startProcess();

		return () => {
			if (loadingTimeoutId) clearTimeout(loadingTimeoutId);
			unlistenOutput?.();
			unlistenError?.();
			unlistenTerminated?.();
		};
	}, [appId]);

	// Parse dependencies from output
	useEffect(() => {
		const parseDependencies = () => {
			const deps: Dependency[] = [];
			const combined = outputLines.join("\n");
			console.log("[useRuntimeCheck] Parsing combined output:", combined);

			// Also check for single-line format (no runtime case)
			// Example: "org.gnome.Platform/x86_64/46  flathub  550.4 MB / 1.3 GB"
			const singleLineMatch = combined.match(
				/(\S+\/\S+\/\S+)\s+(\S+)\s+([\d.]+\s*[KMGT]?B)/,
			);
			if (singleLineMatch) {
				console.log("[useRuntimeCheck] Single-line dependency format detected");
				const [, refName, _remote, size] = singleLineMatch;
				deps.push({
					name: refName,
					download_size: size,
					installed_size: "Unknown",
				});
			}

			// Look for numbered dependency list (runtime case)
			for (const line of combined.split("\n")) {
				const trimmed = line.trim();

				if (/^\d+\./.test(trimmed)) {
					// Normalize all types of spaces and special characters
					const normalized = line
						.replace(/\u00a0/g, " ") // non-breaking space
						.replace(/\t/g, " ") // tab
						.replace(/\?/g, " ") // question marks from encoding issues
						.replace(/\s+/g, " "); // multiple spaces to single

					const parts = normalized.split(" ").filter((s) => s.trim() !== "");

					console.log("[useRuntimeCheck] Parsing line parts:", parts);

					if (parts.length >= 5) {
						const name = parts[1].trim();

						// Extract size - look for pattern like "< 3,2 MB" or "12,5 MB"
						// Start from index 5 (after "flathub")
						let sizeStr = "";
						for (let i = 5; i < parts.length; i++) {
							const p = parts[i];
							// Match: <, numbers (with comma or dot), size units, or (partial)
							if (
								p === "<" ||
								/^[\d,.]+$/.test(p) ||
								["MB", "GB", "kB", "B", "KB"].includes(p) ||
								p === "(partial)"
							) {
								sizeStr += p + " ";
							} else {
								// Stop at non-size parts
								break;
							}
						}

						const finalSize = sizeStr.trim().replace(/\s+/g, " ") || "Unknown";
						console.log("[useRuntimeCheck] Extracted size:", finalSize);

						deps.push({
							name,
							download_size: finalSize,
							installed_size: "Unknown",
						});
					}
				}
			}

			if (deps.length > 0) {
				console.log("[useRuntimeCheck] Parsed dependencies:", deps);
				setDependencies(deps);
			}
		};

		parseDependencies();
	}, [outputLines]);

	// Auto-send 'y' when prompt is ready and there's a pending confirmation
	useEffect(() => {
		if (promptReady && pendingInstallConfirmation && processActive) {
			console.log(
				"[useRuntimeCheck] Prompt ready and install pending, sending 'y'",
			);
			invoke("send_to_pty", { appId, input: "y" }).catch(console.error);
			setPendingInstallConfirmation(false);
		}
	}, [promptReady, pendingInstallConfirmation, processActive, appId]);

	const queueInstallConfirmation = () => {
		console.log("[useRuntimeCheck] Install confirmation queued");
		setPendingInstallConfirmation(true);
	};

	return {
		dependencies,
		loading,
		error,
		processActive,
		queueInstallConfirmation,
	};
}
