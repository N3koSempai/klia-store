import ArrowBack from "@mui/icons-material/ArrowBack";
import BoltRounded from "@mui/icons-material/BoltRounded";
import Delete from "@mui/icons-material/Delete";
import {
	Box,
	Button,
	IconButton,
	Skeleton,
	Tooltip,
	Typography,
} from "@mui/material";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppActionButton } from "../../components/AppActionButton";
import { AppMetaCapsule } from "../../components/AppMetaCapsule";
import { CachedImage } from "../../components/CachedImage";
import { DependencyInfoPopover } from "../../components/DependencyInfoPopover";
import { DonationModal } from "../../components/DonationModal";
import { GitHubStarBadge } from "../../components/GitHubStarBadge";
import { useAppScreenshots } from "../../hooks/useAppScreenshots";
import { useRepoStats } from "../../hooks/useRepoStats";
import { useRuntimeCheck } from "../../hooks/useRuntimeCheck";
import { useInstalledAppsStore } from "../../store/installedAppsStore";
import type { AppStream, CategoryApp } from "../../types";
import { GITHUB_RELEASE_REPOS } from "../../utils/githubReleaseApps";
import {
	InstallProgressPanel,
	type InstallStatus,
	type VerificationResult,
} from "./components/InstallProgressPanel";
import { ScreenshotCarousel } from "./components/ScreenshotCarousel";

interface AppDetailsProps {
	app: CategoryApp;
	onBack: () => void;
}

const SUPPORT_AD_URL =
	"https://www.effectivecpmnetwork.com/k60ttz75nr?key=dea9d180eb8382488214b9d41b884753";

export const AppDetails = ({ app, onBack }: AppDetailsProps) => {
	const { t } = useTranslation();

	// Convert CategoryApp to AppStream for hooks that need it.
	// Pre-loaded screenshots/urls (set for off-Flathub apps) skip the Flathub fetch.
	const appStream: AppStream = useMemo(
		() => ({
			id: app.app_id,
			name: app.name,
			summary: app.summary,
			description: app.description,
			icon: app.icon,
			screenshots: app.screenshots,
			urls: app.urls,
		}),
		[
			app.app_id,
			app.name,
			app.summary,
			app.description,
			app.icon,
			app.screenshots,
			app.urls,
		],
	);

	const {
		screenshots,
		urls,
		isLoading: isLoadingScreenshots,
	} = useAppScreenshots(appStream);
	const isAppInstalled = useInstalledAppsStore((state) => state.isAppInstalled);
	const setInstalledApp = useInstalledAppsStore(
		(state) => state.setInstalledApp,
	);
	const { stars, repoUrl } = useRepoStats(app.app_id, urls);
	const { dependencies, loading: loadingDeps } = useRuntimeCheck(app.app_id);

	// Generate stable UUIDs for screenshots
	const screenshotIds = useMemo(
		() => screenshots?.map(() => crypto.randomUUID()) || [],
		[screenshots],
	);
	const [isInstalling, setIsInstalling] = useState(false);
	const [installOutput, setInstallOutput] = useState<string[]>([]);
	const [installStatus, setInstallStatus] = useState<InstallStatus>("idle");
	const [isUninstalling, setIsUninstalling] = useState(false);
	const [showDonationModal, setShowDonationModal] = useState(false);
	const hasCryptoDonation = !!(
		urls?.donation && /bitcoin|ethereum/i.test(urls.donation)
	);
	const [verificationResult, setVerificationResult] =
		useState<VerificationResult | null>(null);
	const [countdown, setCountdown] = useState(5);
	const [riskCountdown, setRiskCountdown] = useState<number | null>(null);
	const riskCountdownIntervalRef = useRef<ReturnType<
		typeof setInterval
	> | null>(null);
	const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
		null,
	);

	// Use ref to track isInstalling state in event listeners
	const isInstallingRef = useRef(false);
	const isUninstallingRef = useRef(false);
	const installSessionId = useRef<string | null>(null);

	// Update ref when isInstalling changes
	useEffect(() => {
		isInstallingRef.current = isInstalling;
	}, [isInstalling]);

	useEffect(() => {
		isUninstallingRef.current = isUninstalling;
	}, [isUninstalling]);

	// Check if app is already installed
	const isInstalled = isAppInstalled(app.app_id);

	const clearCountdown = useCallback(() => {
		if (countdownIntervalRef.current) {
			clearInterval(countdownIntervalRef.current);
			countdownIntervalRef.current = null;
		}
		if (riskCountdownIntervalRef.current) {
			clearInterval(riskCountdownIntervalRef.current);
			riskCountdownIntervalRef.current = null;
		}
		setCountdown(5);
		setRiskCountdown(null);
	}, []);

	const startRiskCountdown = useCallback(() => {
		if (riskCountdownIntervalRef.current) {
			clearInterval(riskCountdownIntervalRef.current);
		}
		setRiskCountdown(5);
		riskCountdownIntervalRef.current = setInterval(() => {
			setRiskCountdown((prev) => {
				if (prev === null || prev <= 1) {
					if (riskCountdownIntervalRef.current) {
						clearInterval(riskCountdownIntervalRef.current);
						riskCountdownIntervalRef.current = null;
					}
					return null;
				}
				return prev - 1;
			});
		}, 1000);
	}, []);

	// Auto-start risk countdown when hash mismatch is detected
	useEffect(() => {
		if (
			verificationResult?.isHashMismatch &&
			installStatus === "verificationFailed"
		) {
			startRiskCountdown();
		}
	}, [verificationResult?.isHashMismatch, installStatus, startRiskCountdown]);

	// Cleanup: kill PTY process and countdown when leaving the page
	useEffect(() => {
		return () => {
			if (installSessionId.current) {
				console.log("[AppDetails] Cleanup: killing PTY process");
				invoke("kill_pty_process", { appId: app.app_id }).catch(console.error);
				installSessionId.current = null;
			}
			clearCountdown();
		};
	}, [app.app_id, clearCountdown]);

	// PTY events - listen only during installation
	// biome-ignore lint/correctness/useExhaustiveDependencies: Event listeners should only be set up once on mount
	useEffect(() => {
		console.log("[AppDetails] Setting up PTY listeners");

		// PTY events for installation output
		const unlistenPtyOutput = listen<[string, string]>(
			"pty-output",
			(event) => {
				const [appId, line] = event.payload;

				// Accept both the standard app_id key and the local install key (local::<filePath>)
				const isOurProcess =
					(appId === app.app_id || appId === installSessionId.current) &&
					isInstallingRef.current;
				if (isOurProcess) {
					// Split by \r to handle multiple updates in a single emission
					const parts = line.split("\r");

					for (let i = 0; i < parts.length; i++) {
						const part = parts[i];
						const cleanPart = stripAnsi(part);

						// Only add non-empty lines
						if (cleanPart.trim()) {
							setInstallOutput((prev) => {
								// If it's not the first part of a split by \r, or the original line started with \r
								// we overwrite the last line in the terminal.
								if ((i > 0 || line.startsWith("\r")) && prev.length > 0) {
									const newOutput = [...prev];
									newOutput[newOutput.length - 1] = cleanPart;
									return newOutput;
								}

								// Deduplication logic for multi-line blocks (like permissions/dependency lists)
								const isProgress =
									cleanPart.includes("%") ||
									cleanPart.includes("/") ||
									cleanPart.includes("Installing") ||
									cleanPart.includes("Updating");

								if (!isProgress) {
									// If this exact line exists anywhere in the last 15 lines, skip it
									const isHeaderOrInfo =
										cleanPart.includes("permissions:") ||
										cleanPart.includes("ID") ||
										cleanPart.includes("Branch") ||
										cleanPart.includes("Remote") ||
										/^\s*\d+\./.test(cleanPart);

									if (isHeaderOrInfo) {
										const existsRecently = prev
											.slice(-15)
											.some((l) => l.trim() === cleanPart.trim());
										if (existsRecently) return prev;
									}

									// Simple consecutive deduplication
									if (prev.length > 0 && prev[prev.length - 1] === cleanPart) {
										return prev;
									}
								}

								return [...prev, cleanPart];
							});
						}
					}
				}
			},
		);

		const unlistenPtyError = listen<[string, string]>("pty-error", (event) => {
			const [appId, line] = event.payload;
			const isOurProcess =
				(appId === app.app_id || appId === installSessionId.current) &&
				isInstallingRef.current;
			if (isOurProcess) {
				console.log("[AppDetails] PTY error during install:", line);
				setInstallOutput((prev) => [...prev, `Error: ${line}`]);
			}
		});

		const unlistenPtyTerminated = listen<string>("pty-terminated", (event) => {
			const isOurProcess =
				event.payload === app.app_id ||
				event.payload === installSessionId.current;
			if (isOurProcess && isInstallingRef.current) {
				console.log("[AppDetails] PTY terminated during install");
				installSessionId.current = null;

				// Process terminated, verify actual installation status
				setTimeout(async () => {
					try {
						// Check if app was actually installed by querying the system
						const installed = await invoke<{ apps: Array<{ app_id: string }> }>(
							"get_installed_flatpaks",
						);
						const isNowInstalled = installed.apps.some(
							(a) => a.app_id === app.app_id,
						);

						setIsInstalling(false);

						if (isNowInstalled) {
							// Installation successful
							setInstallStatus("success");
							setInstallOutput((p) => {
								if (
									p.some(
										(l) => l === t("appDetails.installationCompletedSuccess"),
									)
								)
									return p;
								return [...p, "", t("appDetails.installationCompletedSuccess")];
							});
							setInstalledApp(app.app_id, true);
						} else {
							// Installation failed
							setInstallStatus("error");
							console.error(
								"[AppDetails] Installation failed - app not found in installed list",
							);
						}
					} catch (error) {
						console.error("[AppDetails] Error verifying installation:", error);
						setIsInstalling(false);
						setInstallStatus("error");
					}
				}, 500);
			}
		});

		return () => {
			unlistenPtyOutput.then((fn) => fn());
			unlistenPtyError.then((fn) => fn());
			unlistenPtyTerminated.then((fn) => fn());
		};
	}, [app.app_id, t, setInstalledApp]);

	// Función para limpiar HTML de la descripción
	const stripHtml = (html: string) => {
		const tmp = document.createElement("div");
		tmp.innerHTML = html;
		return tmp.textContent || tmp.innerText || "";
	};

	// Function to strip ANSI escape codes while preserving Unicode block characters for progress bars
	const stripAnsi = (str: string) => {
		return (
			str
				// Remove ANSI escape sequences (ESC[...m for colors/formatting)
				// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ANSI stripping
				.replace(/\x1b\[[0-9;]*m/g, "")
				// Remove cursor control sequences (ESC[...H, ESC[...A, etc.)
				// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ANSI stripping
				.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
				// Remove sequences with ? prefix (like ESC[?25l for cursor hide)
				// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ANSI stripping
				.replace(/\x1b\[(\?)?[0-9;]*[A-Za-z]/g, "")
				// Remove device status report sequences ([6n)
				.replace(/\[(\d+)n/g, "")
				// Normalize non-breaking spaces to regular spaces
				.replace(/\u00a0/g, " ")
			// Note: We intentionally preserve Unicode block characters (█, ▓, ▒, ░) for progress bars
		);
	};

	const startInstallation = async () => {
		clearCountdown();
		setVerificationResult(null);
		isInstallingRef.current = true;
		setIsInstalling(true);
		setInstallStatus("installing");

		const githubRepo = GITHUB_RELEASE_REPOS[app.app_id];

		if (githubRepo) {
			// Resolve latest release from GitHub API then install locally
			setInstallOutput(["Fetching latest release from GitHub…", ""]);
			try {
				const tmpPath = await invoke<string>("download_flatpak_release", {
					githubRepo,
					appId: app.app_id,
				});
				setInstallOutput((prev) => [
					...prev,
					`Downloaded to ${tmpPath}`,
					"",
					"Installing…",
					"",
				]);

				await invoke("kill_pty_process", { appId: app.app_id }).catch(() => {});
				await new Promise((resolve) => setTimeout(resolve, 100));

				// install_local_flatpak uses processKey "local::<filePath>" for pty events
				const processKey = `local::${tmpPath}`;
				installSessionId.current = processKey;
				await invoke("install_local_flatpak", { filePath: tmpPath });
			} catch (error) {
				console.error("[AppDetails] GitHub release install error:", error);
				setIsInstalling(false);
				setInstallStatus("error");
				setInstallOutput((prev) => [
					...prev,
					"",
					t("appDetails.errorInvokingCommand", { error }),
				]);
				installSessionId.current = null;
			}
			return;
		}

		setInstallOutput([t("appDetails.preparingInstallation"), ""]);
		console.log("[AppDetails] Starting installation");

		try {
			// Kill any existing PTY process first (cleanup)
			await invoke("kill_pty_process", { appId: app.app_id }).catch(() => {
				// Ignore errors if no process exists
			});

			// Small delay to ensure cleanup
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Start fresh PTY process with automatic installation (using -y flag)
			await invoke("start_flatpak_interactive", { appId: app.app_id });
			installSessionId.current = app.app_id;

			console.log("[AppDetails] PTY process started successfully");
		} catch (error) {
			console.error("[AppDetails] Install error:", error);
			setIsInstalling(false);
			setInstallStatus("error");
			setInstallOutput((prev) => [
				...prev,
				"",
				t("appDetails.errorInvokingCommand", { error }),
			]);
			installSessionId.current = null;
		}
	};

	const handleInstall = async () => {
		// Apps installed from GitHub releases skip hash verification
		if (GITHUB_RELEASE_REPOS[app.app_id]) {
			startInstallation();
			return;
		}

		// Start hash verification first
		setInstallStatus("verifying");
		setVerificationResult(null);
		setCountdown(5);

		console.log("[AppDetails] handleInstall - starting hash verification");

		try {
			// Verify app hash before installation
			const result = await invoke<{
				verified: boolean;
				app_id: string;
				sources: Array<{
					url: string;
					commit: string;
					verified: boolean;
					remote_commit?: string;
					error?: string;
					platform?: string;
				}>;
				error?: string;
			}>("verify_app_hash", { appId: app.app_id });

			console.log("[AppDetails] Hash verification result:", result);
			console.log("[AppDetails] Sources:", result.sources);
			console.log("[AppDetails] Error:", result.error);

			if (!result.verified) {
				// Determine the type of failure
				const source = result.sources[0];
				const errorMsg = source?.error || result.error || "";
				const platform = source?.platform || "unknown";

				// Check if platform is unsupported
				const isUnsupportedPlatform = platform === "unsupported";

				// Check if it's specifically a hash mismatch (prioridad más alta - es un error crítico)
				const isHashMismatch =
					errorMsg.toLowerCase().includes("hash mismatch") ||
					errorMsg.toLowerCase().includes("mismatch");

				// Check if it's a source/tag not found issue (warning - no es crítico)
				const isSourceUnavailable =
					!isHashMismatch &&
					(errorMsg.toLowerCase().includes("tag") ||
						errorMsg.toLowerCase().includes("could not verify") ||
						errorMsg.toLowerCase().includes("not found") ||
						errorMsg.toLowerCase().includes("failed to fetch"));

				console.log("[AppDetails] Verification failed:", {
					isHashMismatch,
					isSourceUnavailable,
					isUnsupportedPlatform,
					platform,
					error: errorMsg,
				});

				setVerificationResult({
					verified: false,
					sources: result.sources,
					error: result.error,
					isHashMismatch,
					isUnsupportedPlatform,
				});

				if (isUnsupportedPlatform) {
					setInstallStatus("verificationUnsupported");
				} else {
					setInstallStatus("verificationFailed");
				}
				return;
			}

			// Verification successful, show success state with countdown
			setVerificationResult({
				verified: true,
				sources: result.sources,
				isHashMismatch: false,
				isUnsupportedPlatform: false,
			});
			setInstallStatus("verificationSuccess");

			// Start countdown
			let count = 5;
			countdownIntervalRef.current = setInterval(() => {
				count -= 1;
				setCountdown(count);
				if (count <= 0) {
					clearCountdown();
					startInstallation();
				}
			}, 1000);
		} catch (error) {
			console.error("[AppDetails] Verification error:", error);
			setVerificationResult({
				verified: false,
				sources: [],
				error: String(error),
				isHashMismatch: false,
				isUnsupportedPlatform: false,
			});
			setInstallStatus("verificationFailed");
		}
	};

	const handleForceContinue = () => {
		clearCountdown();
		startInstallation();
	};

	const handleCancelVerification = () => {
		clearCountdown();
		setInstallStatus("idle");
		setVerificationResult(null);
	};

	const handleShowVerificationDetails = () => {
		// Show details in terminal-like format
		if (verificationResult) {
			const verifiedLabel = verificationResult.verified
				? t("appDetails.securityVerificationVerified")
				: t("appDetails.securityVerificationFailed");
			const details = [
				t("appDetails.securityVerificationDetailsTitle"),
				"==============================",
				"",
				`${t("appDetails.securityVerificationOverallStatus")}: ${verificationResult.verified ? "✓" : "✗"} ${verifiedLabel}`,
				"",
				`${t("appDetails.securityVerificationSourcesChecked")}:`,
				...verificationResult.sources.map(
					(s) => `  [${s.verified ? "✓" : "✗"}] ${s.url}`,
				),
				"",
				...(verificationResult.error
					? [
							`${t("appDetails.securityVerificationError")}: ${verificationResult.error}`,
						]
					: []),
			];
			setInstallOutput(details);
			setInstallStatus("verificationDetails");
		}
	};

	const handleDownloadLog = async () => {
		const logContent = installOutput.join("\n");
		const timestamp = new Date().toISOString().replace(/:/g, "-").split(".")[0];
		const defaultFileName = `install-log-${app.app_id}-${timestamp}.txt`;

		try {
			const filePath = await save({
				defaultPath: defaultFileName,
				filters: [
					{
						name: "Text Files",
						extensions: ["txt"],
					},
				],
			});

			if (filePath) {
				await writeTextFile(filePath, logContent);
			}
		} catch (error) {
			console.error("Error al guardar el log:", error);
		}
	};

	const handleAccept = () => {
		setInstallStatus("idle");
		setInstallOutput([]);
	};

	const handleWatchAd = async () => {
		try {
			await openUrl(SUPPORT_AD_URL);
		} catch (error) {
			console.error("Error opening support ad:", error);
		}
	};

	const handleLaunchApp = async () => {
		if (isInstalled) {
			try {
				await invoke("launch_flatpak", { appId: app.app_id });
			} catch (error) {
				console.error("Error launching app:", error);
			}
		}
	};

	const handleUninstall = async () => {
		if (isInstalled) {
			setIsUninstalling(true);
			try {
				await invoke("uninstall_flatpak", { appId: app.app_id });
				setInstalledApp(app.app_id, false);
			} catch (error) {
				console.error("Error uninstalling app:", error);
			} finally {
				setIsUninstalling(false);
			}
		}
	};

	// Determine button status
	const getButtonStatus = ():
		| "installed"
		| "missing"
		| "busy"
		| "verifying" => {
		if (isUninstalling) return "busy";
		if (installStatus === "installing") return "busy";
		if (installStatus === "verifying") return "verifying";
		if (installStatus === "verificationSuccess") return "busy";
		if (installStatus === "verificationFailed") return "busy";
		if (installStatus === "verificationUnsupported") return "busy";
		if (installStatus === "verificationDetails") return "busy";
		if (isInstalled) return "installed";
		return "missing";
	};

	return (
		<Box sx={{ p: 3 }}>
			{/* Botón de regreso */}
			<IconButton
				aria-label={t("appDetails.back")}
				onClick={onBack}
				sx={{ mb: 2 }}
			>
				<ArrowBack />
			</IconButton>

			{/* Sección superior: Icono, Nombre y Botón Instalar */}
			<Box
				sx={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					mb: 4,
					pb: 3,
					borderBottom: "1px solid",
					borderColor: "divider",
				}}
			>
				<Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
					{/* Icono */}
					<Box
						sx={{
							width: 80,
							height: 80,
							borderRadius: 2,
							overflow: "hidden",
							bgcolor: "transparent",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
						}}
					>
						{app.icon ? (
							app.icon.startsWith("http") ? (
								<CachedImage
									appId={app.app_id}
									imageUrl={app.icon}
									alt={app.name}
									variant="rounded"
									style={{
										width: "100%",
										height: "100%",
										objectFit: "cover",
									}}
								/>
							) : (
								<img
									src={app.icon}
									alt={app.name}
									style={{
										width: "100%",
										height: "100%",
										objectFit: "contain",
									}}
								/>
							)
						) : (
							<Typography variant="caption" color="text.secondary">
								{t("appDetails.noIcon")}
							</Typography>
						)}
					</Box>

					{/* Nombre y Summary */}
					<Box>
						<Typography variant="h4" fontWeight="bold">
							{app.name}
						</Typography>
						<Typography variant="body2" color="text.secondary">
							{app.summary}
						</Typography>

						{/* Metadata Row */}
						<Box
							sx={{ display: "flex", flexDirection: "row", gap: 2, mt: 1.5 }}
						>
							{stars !== null && repoUrl && (
								<GitHubStarBadge count={stars} url={repoUrl} />
							)}
							<AppMetaCapsule
								isVerified={app.verification_verified}
								license={app.project_license}
								downloads={app.installs_last_month}
							/>
						</Box>
					</Box>
				</Box>

				{/* Install Button and Runtime Status */}
				<Box
					sx={{
						display: "flex",
						flexDirection: "column",
						gap: 1,
						minWidth: 200,
					}}
				>
					<Box sx={{ display: "flex", gap: 1 }}>
						{hasCryptoDonation && installStatus === "idle" && (
							<Tooltip
								title={t("donation.tooltipSupport")}
								arrow
								placement="top"
							>
								<Button
									variant="outlined"
									onClick={() => setShowDonationModal(true)}
									startIcon={<BoltRounded />}
									sx={{
										py: 1.5,
										px: 2.5,
										fontSize: "1rem",
										fontWeight: 600,
										fontFamily: "Inter, sans-serif",
										textTransform: "uppercase",
										color: "#d29922",
										borderColor: "rgba(210, 153, 34, 0.45)",
										bgcolor: "rgba(210, 153, 34, 0.05)",
										whiteSpace: "nowrap",
										flexShrink: 0,
										"&:hover": {
											borderColor: "#d29922",
											bgcolor: "rgba(210, 153, 34, 0.1)",
										},
									}}
								>
									{t("donation.supportButton")}
								</Button>
							</Tooltip>
						)}
						<AppActionButton
							status={getButtonStatus()}
							busyAction={isUninstalling ? "uninstalling" : "installing"}
							onAction={isInstalled ? handleLaunchApp : handleInstall}
							fullWidth
						/>
						{isInstalled && !isUninstalling && (
							<Tooltip title={t("appDetails.uninstall")} arrow>
								<IconButton
									onClick={handleUninstall}
									sx={{
										bgcolor: "rgba(255, 255, 255, 0.05)",
										border: "1px solid rgba(255, 255, 255, 0.1)",
										borderRadius: "6px",
										width: 48,
										height: 48,
										transition: "all 0.2s",
										"&:hover": {
											bgcolor: "rgba(239, 68, 68, 0.1)",
											borderColor: "rgba(239, 68, 68, 0.3)",
											color: "#ef4444",
										},
									}}
								>
									<Delete />
								</IconButton>
							</Tooltip>
						)}
					</Box>

					{/* Dependency Info Popover */}
					{!isInstalled &&
						installStatus === "idle" &&
						(loadingDeps ? (
							<Skeleton
								variant="rounded"
								width="100%"
								height={72}
								sx={{
									bgcolor: "rgba(255, 255, 255, 0.05)",
								}}
							/>
						) : dependencies.length > 0 ? (
							(() => {
								// Separar la app principal de las dependencias
								const mainAppDep = dependencies.find(
									(dep) => dep.name === app.app_id,
								);
								const deps = dependencies.filter(
									(dep) => dep.name !== app.app_id,
								);

								return (
									<DependencyInfoPopover
										appSize={mainAppDep?.download_size || "Unknown"}
										dependencies={deps.map((dep) => ({
											id: dep.name,
											size: dep.download_size,
										}))}
										appId={app.app_id}
									/>
								);
							})()
						) : null)}
				</Box>
			</Box>

			{/* Sección de Screenshots - Carrusel, Terminal o Resultado */}
			<Box sx={{ mb: 4 }}>
				{installStatus === "idle" ? (
					<ScreenshotCarousel
						appId={app.app_id}
						screenshots={screenshots}
						screenshotIds={screenshotIds}
						isLoading={isLoadingScreenshots}
						t={t}
					/>
				) : (
					<InstallProgressPanel
						installStatus={installStatus}
						countdown={countdown}
						verificationResult={verificationResult}
						riskCountdown={riskCountdown}
						installOutput={installOutput}
						isInstalling={isInstalling}
						t={t}
						onShowVerificationDetails={handleShowVerificationDetails}
						onForceContinue={handleForceContinue}
						onCancelVerification={handleCancelVerification}
						onBackFromDetails={() => {
							setInstallOutput([]);
							setInstallStatus("verificationFailed");
						}}
						onDownloadLog={handleDownloadLog}
						onAccept={handleAccept}
						onWatchAd={handleWatchAd}
					/>
				)}
			</Box>

			{/* Descripción */}
			{app.description && (
				<Box sx={{ mt: 4 }}>
					<Typography variant="h6" gutterBottom>
						{t("appDetails.aboutThisApp")}
					</Typography>
					<Typography variant="body1" color="text.secondary">
						{stripHtml(app.description)}
					</Typography>
				</Box>
			)}

			<DonationModal
				open={showDonationModal}
				onClose={() => setShowDonationModal(false)}
				appId={app.app_id}
				appName={app.name}
				developerName={app.developer_name}
				donationUrl={urls?.donation}
				isInstalled={isInstalled}
				onInstall={handleInstall}
			/>
		</Box>
	);
};
