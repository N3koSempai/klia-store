import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import {
	ArrowBack,
	ChevronLeft,
	ChevronRight,
	Delete,
} from "@mui/icons-material";
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
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { v4 as uuidv4 } from "uuid";
import { AppActionButton } from "../../components/AppActionButton";
import { AppMetaCapsule } from "../../components/AppMetaCapsule";
import { CachedImage } from "../../components/CachedImage";
import { DependencyInfoPopover } from "../../components/DependencyInfoPopover";
import { GitHubStarBadge } from "../../components/GitHubStarBadge";
import { Terminal } from "../../components/Terminal";
import { useAppScreenshots } from "../../hooks/useAppScreenshots";
import { useRepoStats } from "../../hooks/useRepoStats";
import { useRuntimeCheck } from "../../hooks/useRuntimeCheck";
import { useInstalledAppsStore } from "../../store/installedAppsStore";
import type { AppStream, CategoryApp } from "../../types";

interface AppDetailsProps {
	app: CategoryApp;
	onBack: () => void;
}

export const AppDetails = ({ app, onBack }: AppDetailsProps) => {
	const { t } = useTranslation();

	// Convert CategoryApp to AppStream for hooks that need it
	const appStream: AppStream = {
		id: app.app_id,
		name: app.name,
		summary: app.summary,
		description: app.description,
		icon: app.icon,
		screenshots: undefined,
		urls: undefined,
	};

	const {
		screenshots,
		urls,
		isLoading: isLoadingScreenshots,
	} = useAppScreenshots(appStream);
	const { isAppInstalled, setInstalledApp } = useInstalledAppsStore();
	const { stars, repoUrl } = useRepoStats(app.app_id, urls);
	const runtimeCheck = useRuntimeCheck(app.app_id);
	const [currentImageIndex, setCurrentImageIndex] = useState(0);

	// Generate stable UUIDs for screenshots
	const screenshotIds = useMemo(
		() => screenshots?.map(() => uuidv4()) || [],
		[screenshots],
	);
	const [isInstalling, setIsInstalling] = useState(false);
	const [installOutput, setInstallOutput] = useState<string[]>([]);
	const [installStatus, setInstallStatus] = useState<
		"idle" | "installing" | "success" | "error"
	>("idle");
	const [isUninstalling, setIsUninstalling] = useState(false);

	// Use ref to track isInstalling state in event listeners
	const isInstallingRef = useRef(false);

	// Update ref when isInstalling changes
	useEffect(() => {
		isInstallingRef.current = isInstalling;
	}, [isInstalling]);

	// Check if app is already installed
	const isInstalled = isAppInstalled(app.app_id);

	// Escuchar eventos de instalación (legacy)
	// biome-ignore lint/correctness/useExhaustiveDependencies: Event listeners should only be set up once on mount
	useEffect(() => {
		// Legacy install events
		const unlistenOutput = listen<string>("install-output", (event) => {
			setInstallOutput((prev) => [...prev, event.payload]);
		});

		const unlistenError = listen<string>("install-error", (event) => {
			setInstallOutput((prev) => [...prev, `Error: ${event.payload}`]);
		});

		const unlistenCompleted = listen<number>("install-completed", (event) => {
			setIsInstalling(false);
			if (event.payload === 0) {
				setInstallOutput((prev) => [
					...prev,
					"",
					t("appDetails.installationCompletedSuccess"),
				]);
				setInstallStatus("success");
				// Mark app as installed in the store
				setInstalledApp(app.app_id, true);
			} else {
				setInstallOutput((prev) => [
					...prev,
					"",
					t("appDetails.installationFailed", { code: event.payload }),
				]);
				setInstallStatus("error");
			}
		});

		return () => {
			unlistenOutput.then((fn) => fn());
			unlistenError.then((fn) => fn());
			unlistenCompleted.then((fn) => fn());

			// Cleanup: kill PTY process if active when leaving the page
			if (runtimeCheck.processActive) {
				invoke("kill_pty_process", { appId: app.app_id }).catch(console.error);
			}
		};
	}, []);

	// PTY events - always listen, but only process during installation
	// biome-ignore lint/correctness/useExhaustiveDependencies: Event listeners should only be set up once on mount
	useEffect(() => {
		let unlistenPtyOutput: (() => void) | null = null;
		let unlistenPtyError: (() => void) | null = null;
		let unlistenPtyTerminated: (() => void) | null = null;

		const setupListeners = async () => {
			console.log("[AppDetails] Setting up PTY listeners");

			// PTY events for interactive installation
			unlistenPtyOutput = await listen<[string, string]>(
				"pty-output",
				(event) => {
					const [appId, line] = event.payload;
					console.log(
						"[AppDetails] PTY event received - appId:",
						appId,
						"our app:",
						app.app_id,
						"installing:",
						isInstallingRef.current,
						"line:",
						line,
					);

					// Only process if this is our app AND we're installing (using ref for current value)
					if (appId === app.app_id && isInstallingRef.current) {
						console.log("[AppDetails] ✓ Processing PTY output during install");

						// Clean ANSI codes before displaying
						const cleanLine = stripAnsi(line);
						console.log("[AppDetails] Clean line:", cleanLine);

						// Only add non-empty lines
						if (cleanLine.trim()) {
							setInstallOutput((prev) => {
								const newOutput = [...prev, cleanLine];
								console.log(
									"[AppDetails] Updated output, lines:",
									newOutput.length,
								);
								return newOutput;
							});
						}

						// Don't try to detect completion from progress - flatpak can reset counters
						// when installing runtime vs app. Just rely on pty-terminated event.
					}
				},
			);
			console.log("[AppDetails] PTY output listener set up");

			unlistenPtyError = await listen<[string, string]>(
				"pty-error",
				(event) => {
					const [appId, line] = event.payload;
					if (appId === app.app_id && isInstallingRef.current) {
						console.log("[AppDetails] PTY error during install:", line);
						setInstallOutput((prev) => [...prev, `Error: ${line}`]);
					}
				},
			);

			unlistenPtyTerminated = await listen<string>(
				"pty-terminated",
				(event) => {
					if (event.payload === app.app_id && isInstallingRef.current) {
						console.log("[AppDetails] PTY terminated during install");

						// Process terminated, mark installation based on output
						setInstallOutput((prev) => {
							const hasSuccess = prev.some((l) =>
								l.match(/(Installing|Updating)\s+\d+\/\d+.*100%/),
							);

							setTimeout(() => {
								setIsInstalling(false);
								if (hasSuccess) {
									setInstallStatus("success");
									setInstallOutput((p) => [
										...p,
										"",
										t("appDetails.installationCompletedSuccess"),
									]);
									setInstalledApp(app.app_id, true);
								} else {
									setInstallStatus("error");
								}
							}, 500); // Small delay to show final output

							return prev;
						});
					}
				},
			);
		};

		setupListeners();

		return () => {
			unlistenPtyOutput?.();
			unlistenPtyError?.();
			unlistenPtyTerminated?.();
		};
	}, []);

	// Función para limpiar HTML de la descripción
	const stripHtml = (html: string) => {
		const tmp = document.createElement("div");
		tmp.innerHTML = html;
		return tmp.textContent || tmp.innerText || "";
	};

	const handlePrevImage = () => {
		if (screenshots && screenshots.length > 0) {
			setCurrentImageIndex((prev) =>
				prev === 0 ? screenshots.length - 1 : prev - 1,
			);
		}
	};

	const handleNextImage = () => {
		if (screenshots && screenshots.length > 0) {
			setCurrentImageIndex((prev) =>
				prev === screenshots.length - 1 ? 0 : prev + 1,
			);
		}
	};

	// Function to strip ANSI escape codes
	// biome-ignore lint/suspicious/noControlCharactersInRegex: Need to strip ANSI codes from terminal output
	const stripAnsi = (str: string) => {
		return str
			.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
			.replace(/\x1b\[(\?)?[0-9;]*[a-zA-Z]/g, "")
			.replace(/\[(\d+)n/g, "");
	};

	const handleInstall = async () => {
		// Set installing state and ref IMMEDIATELY
		isInstallingRef.current = true;
		setIsInstalling(true);
		setInstallStatus("installing");
		setInstallOutput([t("appDetails.preparingInstallation"), ""]);

		console.log(
			"[AppDetails] handleInstall - ref set to:",
			isInstallingRef.current,
		);

		try {
			// If there's an active PTY process from dependency check, reuse it
			if (runtimeCheck.processActive) {
				console.log(
					"[AppDetails] Using existing PTY process, queuing confirmation",
				);
				// Queue the 'y' confirmation - it will be sent when prompt is ready
				runtimeCheck.queueInstallConfirmation();
				console.log("[AppDetails] Install confirmation queued");
			} else {
				console.log("[AppDetails] No PTY process active, using legacy install");
				// Fallback to old method if no process is active
				await invoke("install_flatpak", {
					appId: app.app_id,
				});
			}
		} catch (error) {
			console.error("[AppDetails] Install error:", error);
			setIsInstalling(false);
			setInstallStatus("error");
			setInstallOutput((prev) => [
				...prev,
				"",
				t("appDetails.errorInvokingCommand", { error }),
			]);
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
	const getButtonStatus = (): "installed" | "missing" | "busy" => {
		if (isUninstalling) return "busy";
		if (installStatus === "installing") return "busy";
		if (isInstalled) return "installed";
		return "missing";
	};

	return (
		<Box sx={{ p: 3, minHeight: "100vh" }}>
			{/* Botón de regreso */}
			<IconButton onClick={onBack} sx={{ mb: 2 }}>
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
							bgcolor: "grey.800",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
						}}
					>
						{app.icon ? (
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
						(runtimeCheck.loading ? (
							<Skeleton
								variant="rounded"
								width="100%"
								height={72}
								sx={{
									bgcolor: "rgba(255, 255, 255, 0.05)",
								}}
							/>
						) : runtimeCheck.dependencies.length > 0 ? (
							(() => {
								// Separar la app principal de las dependencias
								const mainAppDep = runtimeCheck.dependencies.find(
									(dep) => dep.name === app.app_id,
								);
								const deps = runtimeCheck.dependencies.filter(
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
				{installStatus === "installing" ? (
					<>
						<Typography variant="h6" gutterBottom textAlign="center">
							{t("appDetails.installationInProgress")}
						</Typography>
						<Terminal output={installOutput} isRunning={isInstalling} />
					</>
				) : installStatus === "success" || installStatus === "error" ? (
					<Box
						sx={{
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							gap: 3,
							p: 4,
							minHeight: 500,
						}}
					>
						{/* Animación */}
						<Box sx={{ width: 300, height: 300 }}>
							<DotLottieReact
								key={installStatus}
								src={
									installStatus === "success"
										? "../../assets/animations/success.lottie"
										: "../../assets/animations/Error.lottie"
								}
								loop={false}
								autoplay={true}
							/>
						</Box>

						{/* Mensaje */}
						<Typography variant="h5" textAlign="center">
							{installStatus === "success"
								? t("appDetails.installationCompleted")
								: t("appDetails.installationError")}
						</Typography>

						{/* Botones */}
						<Box sx={{ display: "flex", gap: 2 }}>
							<Button
								variant="outlined"
								onClick={handleDownloadLog}
								sx={{ px: 3 }}
							>
								{t("appDetails.getLog")}
							</Button>
							<Button variant="contained" onClick={handleAccept} sx={{ px: 3 }}>
								{t("appDetails.accept")}
							</Button>
						</Box>
					</Box>
				) : (
					<>
						<Typography variant="h6" gutterBottom textAlign="center">
							{t("appDetails.screenshots")}
						</Typography>
						{isLoadingScreenshots ? (
							<Box
								sx={{
									position: "relative",
									width: "100%",
									maxWidth: 900,
									margin: "0 auto",
								}}
							>
								<Skeleton
									variant="rounded"
									sx={{
										width: "100%",
										height: 500,
									}}
									animation="wave"
								/>
							</Box>
						) : screenshots && screenshots.length > 0 ? (
							<Box
								sx={{
									position: "relative",
									width: "100%",
									maxWidth: 900,
									margin: "0 auto",
								}}
							>
								{/* Imagen actual */}
								<Box
									sx={{
										width: "100%",
										height: 500,
										bgcolor: "grey.900",
										borderRadius: 2,
										overflow: "hidden",
										position: "relative",
									}}
								>
									{screenshots.map((screenshot, index) => {
										// Buscar el tamaño más grande o el primero disponible
										const largestSize = screenshot.sizes.reduce(
											(prev, current) =>
												Number.parseInt(prev.width, 10) >
												Number.parseInt(current.width, 10)
													? prev
													: current,
										);
										return (
											<Box
												key={screenshotIds[index]}
												sx={{
													position: "absolute",
													top: 0,
													left: 0,
													width: "100%",
													height: "100%",
													display:
														index === currentImageIndex ? "flex" : "none",
													alignItems: "center",
													justifyContent: "center",
												}}
											>
												<CachedImage
													appId={app.app_id}
													imageUrl={largestSize.src}
													alt={`Screenshot ${index + 1}`}
													cacheKey={`${app.app_id}:::${index + 1}`}
													variant="rounded"
													showErrorPlaceholder={false}
													maxRetries={3}
													style={{
														width: "100%",
														height: "100%",
														maxWidth: "100%",
														maxHeight: "100%",
														objectFit: "contain",
													}}
												/>
											</Box>
										);
									})}
								</Box>

								{/* Controles del carrusel */}
								{screenshots.length > 1 && (
									<>
										<IconButton
											onClick={handlePrevImage}
											sx={{
												position: "absolute",
												left: 10,
												top: "50%",
												transform: "translateY(-50%)",
												bgcolor: "rgba(0, 0, 0, 0.5)",
												color: "white",
												"&:hover": {
													bgcolor: "rgba(0, 0, 0, 0.7)",
												},
											}}
										>
											<ChevronLeft />
										</IconButton>
										<IconButton
											onClick={handleNextImage}
											sx={{
												position: "absolute",
												right: 10,
												top: "50%",
												transform: "translateY(-50%)",
												bgcolor: "rgba(0, 0, 0, 0.5)",
												color: "white",
												"&:hover": {
													bgcolor: "rgba(0, 0, 0, 0.7)",
												},
											}}
										>
											<ChevronRight />
										</IconButton>

										{/* Indicadores */}
										<Box
											sx={{
												display: "flex",
												justifyContent: "center",
												gap: 1,
												mt: 2,
											}}
										>
											{screenshots.map((_, index) => (
												<Box
													key={uuidv4()}
													onClick={() => setCurrentImageIndex(index)}
													sx={{
														width: 8,
														height: 8,
														borderRadius: "50%",
														bgcolor:
															index === currentImageIndex
																? "primary.main"
																: "grey.600",
														cursor: "pointer",
														transition: "all 0.3s",
														"&:hover": {
															bgcolor:
																index === currentImageIndex
																	? "primary.main"
																	: "grey.500",
														},
													}}
												/>
											))}
										</Box>
									</>
								)}
							</Box>
						) : (
							<Box
								sx={{
									textAlign: "center",
									py: 4,
									color: "text.secondary",
								}}
							>
								<Typography>{t("appDetails.noScreenshots")}</Typography>
							</Box>
						)}
					</>
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
		</Box>
	);
};
