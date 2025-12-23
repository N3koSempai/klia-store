import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface FlatpakOperationProgress {
	output: string;
	progress?: number;
}

export interface FlatpakOperationResult {
	success: boolean;
	exitCode: number;
	output: string[];
}

/**
 * Executes a flatpak operation and returns a promise that resolves when complete
 * This converts Tauri's event-based system into a promise-based one
 */
export async function executeFlatpakOperation(
	command: () => Promise<void>,
	onProgress?: (progress: FlatpakOperationProgress) => void,
): Promise<FlatpakOperationResult> {
	console.log("[executeFlatpakOperation] Starting operation...");
	const output: string[] = [];
	let unlistenOutput: UnlistenFn | null = null;
	let unlistenError: UnlistenFn | null = null;
	let unlistenCompleted: UnlistenFn | null = null;

	return new Promise<FlatpakOperationResult>(async (resolve, reject) => {
		try {
			// Listen to output events
			unlistenOutput = await listen<string>("install-output", (event) => {
				const line = event.payload;
				console.log("[executeFlatpakOperation] Output:", line);
				output.push(line);

				// Parse progress if available
				const progressMatch = line.match(/Actualizando\s+(\d+)\/(\d+)/);
				if (progressMatch && onProgress) {
					const currentPart = Number.parseInt(progressMatch[1], 10);
					const totalParts = Number.parseInt(progressMatch[2], 10);

					const percentMatch = line.match(/(\d+)%/);
					let progress = 0;

					if (percentMatch) {
						const partProgress = Number.parseInt(percentMatch[1], 10);
						progress = ((currentPart - 1) * 100 + partProgress) / totalParts;
					} else {
						progress = ((currentPart - 1) / totalParts) * 100;
					}

					onProgress({
						output: line,
						progress: Math.min(100, Math.round(progress)),
					});
				} else if (onProgress) {
					onProgress({ output: line });
				}
			});

			// Listen to error events
			unlistenError = await listen<string>("install-error", (event) => {
				const errorMsg = `Error: ${event.payload}`;
				console.log("[executeFlatpakOperation] Error:", errorMsg);
				output.push(errorMsg);
				if (onProgress) {
					onProgress({ output: errorMsg });
				}
			});

			// Listen to completion event
			unlistenCompleted = await listen<number>("install-completed", (event) => {
				const exitCode = event.payload;
				const success = exitCode === 0;
				console.log(
					"[executeFlatpakOperation] Completed with exit code:",
					exitCode,
				);

				// Cleanup listeners
				unlistenOutput?.();
				unlistenError?.();
				unlistenCompleted?.();

				resolve({
					success,
					exitCode,
					output,
				});
			});

			console.log(
				"[executeFlatpakOperation] Listeners set up, executing command...",
			);
			// Start the operation
			await command();
			console.log("[executeFlatpakOperation] Command executed");
		} catch (error) {
			console.error(
				"[executeFlatpakOperation] Error executing command:",
				error,
			);
			// Cleanup listeners on error
			unlistenOutput?.();
			unlistenError?.();
			unlistenCompleted?.();

			reject(error);
		}
	});
}

/**
 * Update a single flatpak app
 */
export async function updateFlatpakApp(
	appId: string,
	onProgress?: (progress: FlatpakOperationProgress) => void,
): Promise<FlatpakOperationResult> {
	return executeFlatpakOperation(
		() => invoke("update_flatpak", { appId }),
		onProgress,
	);
}

/**
 * Update system flatpaks (runtimes, extensions, etc.)
 */
export async function updateSystemFlatpaks(
	onProgress?: (progress: FlatpakOperationProgress) => void,
): Promise<FlatpakOperationResult> {
	return executeFlatpakOperation(
		() => invoke("update_system_flatpaks"),
		onProgress,
	);
}

/**
 * Uninstall a flatpak app
 */
export async function uninstallFlatpakApp(
	appId: string,
	onProgress?: (progress: FlatpakOperationProgress) => void,
): Promise<FlatpakOperationResult> {
	return executeFlatpakOperation(
		() => invoke("uninstall_flatpak", { appId }),
		onProgress,
	);
}

/**
 * Install a flatpak extension
 */
export async function installExtension(
	extensionId: string,
	onProgress?: (progress: FlatpakOperationProgress) => void,
): Promise<FlatpakOperationResult> {
	return executeFlatpakOperation(
		() => invoke("install_extension", { extensionId }),
		onProgress,
	);
}

/**
 * Uninstall a flatpak extension
 */
export async function uninstallExtension(
	extensionId: string,
	onProgress?: (progress: FlatpakOperationProgress) => void,
): Promise<FlatpakOperationResult> {
	return executeFlatpakOperation(
		() => invoke("uninstall_extension", { extensionId }),
		onProgress,
	);
}
