import { ArrowBack, InfoOutlined, SystemUpdateAlt } from "@mui/icons-material";
import {
	alpha,
	Box,
	Button,
	Chip,
	CircularProgress,
	Container,
	Dialog,
	DialogContent,
	IconButton,
	Stack,
	Typography,
	useTheme,
} from "@mui/material";
import { invoke } from "@tauri-apps/api/core";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ReleaseNotesModal } from "../../components/ReleaseNotesModal";
import { Terminal } from "../../components/Terminal";
import { UpdateAllModal } from "../../components/UpdateAllModal";
import { useAppVerification } from "../../hooks/useAppVerification";
import { useUninstallApp } from "../../hooks/useUninstallApp";
import { useUpdateAll } from "../../hooks/useUpdateAll";
import { useUpdateApp } from "../../hooks/useUpdateApp";
import type { InstalledAppInfo } from "../../store/installedAppsStore";
import { useInstalledAppsStore } from "../../store/installedAppsStore";
import { checkAvailableUpdates } from "../../utils/updateChecker";
import { InstalledAppCard } from "./components/InstalledAppCard";

interface InstalledAppRust {
	app_id: string;
	name: string;
	version: string;
	summary?: string;
	developer?: string;
}

interface InstalledExtensionRust {
	extension_id: string;
	name: string;
	version: string;
	parent_app_id: string;
}

interface InstalledPackagesResponse {
	apps: InstalledAppRust[];
	runtimes: string[];
	extensions: InstalledExtensionRust[];
}

interface MyAppsProps {
	onBack: () => void;
	onDeveloperSelect?: (
		developerId: string,
		developerName: string,
		appId: string,
	) => void;
}

// Memoized wrapper for app card to prevent recreating callbacks
interface AppCardWrapperProps {
	app: InstalledAppInfo;
	hasUpdate: boolean;
	isUpdating: boolean;
	isUninstalling: boolean;
	cardHeight: number;
	onUpdate: (appId: string) => void;
	onUninstall: (appId: string) => void;
	onShowReleaseNotes: (appId: string) => void;
	onDeveloperClick?: (
		developerId: string,
		developerName: string,
		appId: string,
	) => void;
}

const AppCardWrapper = memo(
	({
		app,
		hasUpdate,
		isUpdating,
		isUninstalling,
		cardHeight,
		onUpdate,
		onUninstall,
		onShowReleaseNotes,
		onDeveloperClick,
	}: AppCardWrapperProps) => {
		const handleUpdate = useCallback(
			() => onUpdate(app.appId),
			[onUpdate, app.appId],
		);
		const handleUninstall = useCallback(
			() => onUninstall(app.appId),
			[onUninstall, app.appId],
		);
		const handleShowReleaseNotes = useCallback(
			() => onShowReleaseNotes(app.appId),
			[onShowReleaseNotes, app.appId],
		);

		return (
			<InstalledAppCard
				app={app}
				hasUpdate={hasUpdate}
				isUpdating={isUpdating}
				isUninstalling={isUninstalling}
				cardHeight={cardHeight}
				onUpdate={handleUpdate}
				onUninstall={handleUninstall}
				onShowReleaseNotes={handleShowReleaseNotes}
				onDeveloperClick={onDeveloperClick}
			/>
		);
	},
);

export const MyApps = ({ onBack, onDeveloperSelect }: MyAppsProps) => {
	const { t } = useTranslation();
	const theme = useTheme();

	// Access store state directly to ensure reactivity
	const installedApps = useInstalledAppsStore(
		(state) => state.installedAppsInfo,
	);
	const updateCount = useInstalledAppsStore((state) => state.updateCount);
	const hasUpdate = useInstalledAppsStore((state) => state.hasUpdate);
	const availableUpdates = useInstalledAppsStore(
		(state) => state.availableUpdates,
	);
	const getUpdateInfo = useInstalledAppsStore((state) => state.getUpdateInfo);
	const setAvailableUpdates = useInstalledAppsStore(
		(state) => state.setAvailableUpdates,
	);
	const setInstalledAppsInfo = useInstalledAppsStore(
		(state) => state.setInstalledAppsInfo,
	);
	const setInstalledExtensions = useInstalledAppsStore(
		(state) => state.setInstalledExtensions,
	);
	const isLoadingUpdates = useInstalledAppsStore(
		(state) => state.isLoadingUpdates,
	);

	const [selectedAppForNotes, setSelectedAppForNotes] = useState<string | null>(
		null,
	);

	// Fixed card height for consistent rendering
	const CARD_HEIGHT = 340;

	// Update All modal state
	const [updateAllModalOpen, setUpdateAllModalOpen] = useState(false);
	const [showUpdateAllTerminal, setShowUpdateAllTerminal] = useState(false);
	const [isReloadingUpdates, setIsReloadingUpdates] = useState(false);

	// Use custom hooks for operations
	const { updateApp, updatingApp, isUpdating, updateOutput, clearUpdate } =
		useUpdateApp();

	// Verification hook for supply chain security before updates
	const {
		state: verificationState,
		result: verificationResult,
		verify: verifyApp,
		forceContinue: verificationForceContinue,
		reset: verificationReset,
	} = useAppVerification();

	const {
		uninstallApp,
		uninstallingApp,
		isUninstalling,
		uninstallOutput,
		clearUninstall,
	} = useUninstallApp();

	const {
		updateAll,
		isUpdatingAll,
		updateAllProgress,
		updateAllOutput,
		systemUpdatesCount: _systemUpdatesCount,
		isUpdatingSystem,
		systemUpdateProgress,
		updateSummary,
		clearUpdateAll,
	} = useUpdateAll();

	const reloadInstalledApps = useCallback(async () => {
		try {
			const response = await invoke<InstalledPackagesResponse>(
				"get_installed_flatpaks",
			);

			// Convert from Rust format to TypeScript format
			const installedAppsInfo: InstalledAppInfo[] = response.apps.map(
				(app) => ({
					instanceId: `${app.app_id}-${app.version}`,
					appId: app.app_id,
					name: app.name,
					version: app.version,
					summary: app.summary,
					developer: app.developer,
				}),
			);

			const installedExtensionsInfo = response.extensions.map((ext) => ({
				extensionId: ext.extension_id,
				name: ext.name,
				version: ext.version,
				parentAppId: ext.parent_app_id,
			}));

			setInstalledAppsInfo(installedAppsInfo);
			setInstalledExtensions(installedExtensionsInfo);

			// After loading installed apps, check for available updates
			const updates = await checkAvailableUpdates();
			setAvailableUpdates(updates);
		} catch (error) {
			console.error("Error reloading installed apps:", error);
		}
	}, [setInstalledAppsInfo, setInstalledExtensions, setAvailableUpdates]);

	const reloadAvailableUpdates = useCallback(async () => {
		try {
			const updates = await checkAvailableUpdates();
			setAvailableUpdates(updates);
		} catch (error) {
			console.error("Error reloading available updates:", error);
		}
	}, [setAvailableUpdates]);

	const handleCloseModal = useCallback(() => {
		setSelectedAppForNotes(null);
	}, []);

	const handleShowReleaseNotes = useCallback((appId: string) => {
		setSelectedAppForNotes(appId);
	}, []);

	// Track which app the update dialog is for (covers both verification and update phases)
	const [updateDialogAppId, setUpdateDialogAppId] = useState<string | null>(
		null,
	);
	const [showVerificationDetails, setShowVerificationDetails] = useState(false);
	const autoUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const handleUpdate = useCallback(
		(appId: string) => {
			setUpdateDialogAppId(appId);
			verificationReset();
			clearUpdate();
			verifyApp(appId);
		},
		[verifyApp, verificationReset, clearUpdate],
	);

	const executeUpdate = useCallback(
		async (appId: string) => {
			const app = installedApps.find((a) => a.appId === appId);
			const success = await updateApp(appId, app?.name);

			if (success) {
				// Reload available updates after successful update
				await reloadAvailableUpdates();
			}
		},
		[updateApp, installedApps, reloadAvailableUpdates],
	);

	// Auto-trigger update when verification succeeds
	useEffect(() => {
		if (verificationState === "success" && updateDialogAppId) {
			// Clear any existing timer to prevent stale timeouts
			if (autoUpdateTimerRef.current) {
				clearTimeout(autoUpdateTimerRef.current);
			}
			// Small delay before starting update so user can see the success state
			autoUpdateTimerRef.current = setTimeout(() => {
				// Only execute if dialog is still open for this app (user didn't close)
				if (updateDialogAppId) {
					executeUpdate(updateDialogAppId);
				}
				autoUpdateTimerRef.current = null;
			}, 1500);
		}
		return () => {
			if (autoUpdateTimerRef.current) {
				clearTimeout(autoUpdateTimerRef.current);
				autoUpdateTimerRef.current = null;
			}
		};
	}, [verificationState, updateDialogAppId, executeUpdate]);

	const handleShowVerificationDetails = useCallback(() => {
		if (verificationResult) {
			setShowVerificationDetails(true);
		}
	}, [verificationResult]);

	const handleCloseUpdateDialog = useCallback(() => {
		// Clear pending auto-update timer
		if (autoUpdateTimerRef.current) {
			clearTimeout(autoUpdateTimerRef.current);
			autoUpdateTimerRef.current = null;
		}
		setUpdateDialogAppId(null);
		setShowVerificationDetails(false);
		verificationReset();
		clearUpdate();
	}, [clearUpdate, verificationReset]);

	const handleUninstall = useCallback(
		async (appId: string) => {
			const app = installedApps.find((a) => a.appId === appId);
			await uninstallApp(appId, app?.name);
		},
		[uninstallApp, installedApps],
	);

	const handleCloseUninstallDialog = useCallback(async () => {
		clearUninstall();
		// Reload installed apps list after uninstall
		await reloadInstalledApps();
	}, [clearUninstall, reloadInstalledApps]);

	const handleUpdateAll = useCallback(() => {
		setUpdateAllModalOpen(true);
	}, []);

	const executeUpdateAll = useCallback(
		async (appsToInclude: Array<{ appId: string; appName: string }>) => {
			const appsToUpdate = installedApps.filter((app) =>
				appsToInclude.some((a) => a.appId === app.appId),
			);
			const initialSystemUpdates = Math.max(
				0,
				updateCount - appsToUpdate.length,
			);

			if (appsToUpdate.length === 0 && initialSystemUpdates === 0) return;

			await updateAll(appsToUpdate, initialSystemUpdates);
			await reloadAvailableUpdates();
		},
		[installedApps, updateCount, updateAll, reloadAvailableUpdates],
	);

	const handleCloseUpdateAllModal = useCallback(async () => {
		setUpdateAllModalOpen(false);
		setShowUpdateAllTerminal(false);
		clearUpdateAll();
		// Reload updates to refresh the button state
		setIsReloadingUpdates(true);
		await reloadAvailableUpdates();
		setIsReloadingUpdates(false);
	}, [clearUpdateAll, reloadAvailableUpdates]);

	const handleToggleUpdateAllTerminal = useCallback(() => {
		setShowUpdateAllTerminal((prev) => !prev);
	}, []);

	// Get selected app info for modal - memoized
	const selectedApp = useMemo(
		() => installedApps.find((app) => app.appId === selectedAppForNotes),
		[installedApps, selectedAppForNotes],
	);
	const updateInfo = useMemo(
		() =>
			selectedAppForNotes ? getUpdateInfo(selectedAppForNotes) : undefined,
		[selectedAppForNotes, getUpdateInfo],
	);

	// Sort apps: those with updates first, then alphabetically
	const sortedApps = useMemo(() => {
		const apps = [...installedApps];
		if (isLoadingUpdates) {
			return apps.sort((a, b) => a.name.localeCompare(b.name));
		}
		return apps.sort((a, b) => {
			const aHasUpdate = a.appId in availableUpdates;
			const bHasUpdate = b.appId in availableUpdates;

			if (aHasUpdate && !bHasUpdate) return -1;
			if (!aHasUpdate && bHasUpdate) return 1;

			// Secondary sort: alphabetical by name
			return a.name.localeCompare(b.name);
		});
	}, [installedApps, availableUpdates, isLoadingUpdates]);

	return (
		<Box
			sx={{
				minHeight: "100vh",
				bgcolor: "background.default",
				pt: 4,
				pb: 8,
			}}
		>
			<Container maxWidth="xl">
				{/* --- HEADER SECTION --- */}
				<Box
					sx={{
						display: "flex",
						flexDirection: { xs: "column", md: "row" },
						alignItems: { xs: "flex-start", md: "flex-start" },
						justifyContent: "space-between",
						mb: 5,
						gap: 3,
					}}
				>
					{/* IZQUIERDA: Navegación y Título */}
					<Stack direction="row" alignItems="center" spacing={2}>
						<IconButton
							onClick={onBack}
							sx={{
								border: `1px solid ${theme.palette.divider}`,
								borderRadius: 3,
								color: "text.primary",
								"&:hover": {
									bgcolor: alpha(theme.palette.primary.main, 0.1),
								},
							}}
						>
							<ArrowBack />
						</IconButton>

						<Box>
							<Stack direction="row" alignItems="center" spacing={2}>
								<Typography
									variant="h4"
									component="h1"
									sx={{ fontWeight: 700, letterSpacing: "-0.02em" }}
								>
									{t("myApps.title")}
								</Typography>

								{/* Contador de Apps estilo Chip */}
								<Chip
									label={
										installedApps.length === 1
											? t("myApps.appInstalled", {
													count: installedApps.length,
												})
											: t("myApps.appsInstalled", {
													count: installedApps.length,
												})
									}
									size="small"
									sx={{
										fontWeight: 600,
										bgcolor: alpha(theme.palette.text.secondary, 0.1),
										color: "text.secondary",
									}}
								/>
							</Stack>

							{/* Subtítulo */}
							<Typography
								variant="body2"
								color="text.secondary"
								sx={{ mt: 0.5 }}
							>
								{t("myApps.subtitle")}
							</Typography>
						</Box>
					</Stack>

					{/* DERECHA: Botón de Actualizar y Texto de Sistema */}
					{(updateCount > 0 || isLoadingUpdates) && (
						<Stack alignItems={{ xs: "flex-start", md: "flex-end" }}>
							<Button
								variant="contained"
								onClick={handleUpdateAll}
								startIcon={
									isReloadingUpdates || isLoadingUpdates ? (
										<CircularProgress size={20} color="inherit" />
									) : (
										<SystemUpdateAlt />
									)
								}
								disabled={
									isUpdatingAll || isReloadingUpdates || isLoadingUpdates
								}
								size="large"
								sx={{
									px: 3,
									py: 1,
									borderRadius: 2,
									textTransform: "none",
									fontSize: "1rem",
									fontWeight: 600,
									boxShadow: `0 4px 14px ${alpha(theme.palette.primary.main, 0.4)}`,
									background: `linear-gradient(45deg, ${theme.palette.primary.main}, ${theme.palette.info.main})`,
								}}
							>
								{isReloadingUpdates || isLoadingUpdates
									? t("myApps.checkingUpdates")
									: updateCount === 1
										? t("myApps.updateAllCount", { count: updateCount })
										: t("myApps.updateAllCount_plural", { count: updateCount })}
							</Button>

							{/* El texto explicativo debajo del botón */}
							{(() => {
								const userAppUpdates = installedApps.filter((app) =>
									hasUpdate(app.appId),
								).length;
								const systemUpdates = updateCount - userAppUpdates;
								return systemUpdates > 0 ? (
									<Stack
										direction="row"
										alignItems="center"
										spacing={0.5}
										sx={{ mt: 1, mr: 0.5 }}
									>
										<InfoOutlined
											sx={{ fontSize: 14, color: "text.secondary" }}
										/>
										<Typography
											variant="caption"
											sx={{
												color: "text.secondary",
												fontWeight: 500,
											}}
										>
											{t("myApps.systemUpdates", { count: systemUpdates })}
										</Typography>
									</Stack>
								) : null;
							})()}
						</Stack>
					)}
				</Box>

				{/* Apps grid - simple CSS grid for better performance */}
				{installedApps.length > 0 ? (
					<Box
						sx={{
							display: "grid",
							gridTemplateColumns: {
								xs: "1fr",
								sm: "repeat(2, 1fr)",
								md: "repeat(3, 1fr)",
								lg: "repeat(4, 1fr)",
								xl: "repeat(5, 1fr)",
							},
							gap: 2,
							width: "100%",
							boxSizing: "border-box",
						}}
					>
						{sortedApps.map((app) => (
							<AppCardWrapper
								key={app.instanceId}
								app={app}
								hasUpdate={hasUpdate(app.appId)}
								isUpdating={
									(isUpdating && updatingApp === app.appId) ||
									verificationState !== "idle"
								}
								isUninstalling={isUninstalling && uninstallingApp === app.appId}
								cardHeight={CARD_HEIGHT}
								onUpdate={handleUpdate}
								onUninstall={handleUninstall}
								onShowReleaseNotes={handleShowReleaseNotes}
								onDeveloperClick={onDeveloperSelect}
							/>
						))}
					</Box>
				) : (
					<Box
						sx={{
							textAlign: "center",
							py: 8,
						}}
					>
						<Typography variant="h6" color="text.secondary">
							{t("myApps.noAppsInstalledMessage")}
						</Typography>
						<Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
							{t("myApps.installAppsMessage")}
						</Typography>
					</Box>
				)}

				{/* Release Notes Modal */}
				{selectedApp && updateInfo && (
					<ReleaseNotesModal
						appId={selectedApp.appId}
						appName={selectedApp.name}
						currentVersion={selectedApp.version}
						newVersion={updateInfo.newVersion}
						changelog={updateInfo.changelog}
						open={selectedAppForNotes !== null}
						onClose={handleCloseModal}
					/>
				)}

				{/* Update Dialog - Verification + Terminal */}
				<Dialog
					open={updateDialogAppId !== null || updatingApp !== null}
					onClose={
						!isUpdating && verificationState === "idle"
							? handleCloseUpdateDialog
							: undefined
					}
					maxWidth={updatingApp !== null ? "md" : "sm"}
					fullWidth
					PaperProps={{
						sx: {
							minWidth: updatingApp !== null ? 600 : 450,
						},
					}}
				>
					<DialogContent>
						{/* Verification View (only shown when not yet updating) */}
						{verificationState !== "idle" && updatingApp === null && (
							<>
								{/* Verifying */}
								{verificationState === "verifying" && (
									<Box
										sx={{
											display: "flex",
											flexDirection: "column",
											alignItems: "center",
											justifyContent: "center",
											gap: 3,
											p: 4,
											minHeight: 300,
											bgcolor: "rgba(255, 255, 255, 0.02)",
											borderRadius: 2,
											border: "1px solid rgba(88, 166, 255, 0.3)",
										}}
									>
										<CircularProgress size={48} sx={{ color: "#58A6FF" }} />
										<Typography
											variant="h6"
											textAlign="center"
											sx={{ color: "#C9D1D9", fontWeight: 500 }}
										>
											{t("appDetails.verifyingSecurity")}
										</Typography>
										<Typography
											variant="body2"
											textAlign="center"
											sx={{ color: "#8B949E" }}
										>
											{t("appDetails.securityCheckingSignatures")}
										</Typography>
									</Box>
								)}

								{/* Success */}
								{verificationState === "success" && (
									<Box
										sx={{
											display: "flex",
											flexDirection: "column",
											alignItems: "center",
											justifyContent: "center",
											gap: 3,
											p: 4,
											minHeight: 300,
											bgcolor: "rgba(255, 255, 255, 0.02)",
											borderRadius: 2,
											border: "1px solid rgba(39, 201, 63, 0.3)",
										}}
									>
										<Box
											sx={{
												width: 80,
												height: 80,
												borderRadius: "50%",
												bgcolor: "rgba(39, 201, 63, 0.1)",
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												border: "2px solid #27c93f",
											}}
										>
											<Typography sx={{ color: "#27c93f", fontSize: "2rem" }}>
												✓
											</Typography>
										</Box>
										<Typography
											variant="h6"
											textAlign="center"
											sx={{ color: "#27c93f", fontWeight: 500 }}
										>
											{t("appDetails.securityVerificationSuccess")}
										</Typography>
										<Typography
											variant="body2"
											textAlign="center"
											sx={{ color: "#8B949E", maxWidth: 500, px: 2 }}
										>
											{t("appDetails.securityHashVerifiedExplanation")}
										</Typography>
										<Typography
											variant="body1"
											textAlign="center"
											sx={{ color: "#C9D1D9" }}
										>
											{t("myApps.updateStartingShortly")}
										</Typography>
									</Box>
								)}

								{/* Failed / Unsupported */}
								{(verificationState === "failed" ||
									verificationState === "unsupported") &&
									!showVerificationDetails && (
										<Box
											sx={{
												display: "flex",
												flexDirection: "column",
												alignItems: "center",
												justifyContent: "center",
												gap: 3,
												p: 4,
												minHeight: 300,
												bgcolor: "rgba(255, 255, 255, 0.02)",
												borderRadius: 2,
												border: `1px solid ${
													verificationResult?.isHashMismatch
														? "rgba(255, 107, 107, 0.5)"
														: "rgba(246, 211, 45, 0.5)"
												}`,
											}}
										>
											<Box
												sx={{
													width: 80,
													height: 80,
													borderRadius: "50%",
													bgcolor: verificationResult?.isHashMismatch
														? "rgba(255, 107, 107, 0.1)"
														: "rgba(246, 211, 45, 0.1)",
													display: "flex",
													alignItems: "center",
													justifyContent: "center",
													border: `2px solid ${
														verificationResult?.isHashMismatch
															? "#FF6B6B"
															: "#F6D32D"
													}`,
												}}
											>
												<Typography
													sx={{
														color: verificationResult?.isHashMismatch
															? "#FF6B6B"
															: "#F6D32D",
														fontSize: "2rem",
													}}
												>
													{verificationResult?.isHashMismatch ? "✗" : "⚠"}
												</Typography>
											</Box>

											<Typography
												variant="h6"
												textAlign="center"
												sx={{
													color: verificationResult?.isHashMismatch
														? "#FF6B6B"
														: "#F6D32D",
													fontWeight: 500,
												}}
											>
												{verificationState === "unsupported"
													? t("appDetails.securityUnsupportedPlatform")
													: verificationResult?.isHashMismatch
														? t("appDetails.securityVerificationFailed")
														: t("appDetails.securityVerificationFailed")}
											</Typography>

											<Typography
												variant="body2"
												textAlign="center"
												sx={{
													color: "#8B949E",
													maxWidth: 500,
													px: 2,
												}}
											>
												{t("appDetails.securityHashVerificationExplanation")}
											</Typography>

											<Typography
												variant="body1"
												textAlign="center"
												sx={{
													color: "#C9D1D9",
													maxWidth: 600,
												}}
											>
												{verificationState === "unsupported"
													? t("appDetails.securityUnsupportedPlatformMessage")
													: verificationResult?.isHashMismatch
														? t("appDetails.securityHashMismatch")
														: t("appDetails.securitySourceUnavailable")}
											</Typography>

											{/* Action Buttons */}
											<Box sx={{ display: "flex", gap: 2, mt: 2 }}>
												<Button
													variant="outlined"
													onClick={handleShowVerificationDetails}
													sx={{
														px: 3,
														borderColor: "rgba(255, 255, 255, 0.3)",
														color: "#C9D1D9",
														"&:hover": {
															borderColor: "rgba(255, 255, 255, 0.5)",
															bgcolor: "rgba(255, 255, 255, 0.05)",
														},
													}}
												>
													{t("myApps.verificationMoreDetails")}
												</Button>
												<Button
													variant="contained"
													onClick={() => {
														verificationForceContinue();
														if (updateDialogAppId) {
															executeUpdate(updateDialogAppId);
														}
													}}
													disabled={
														verificationResult?.isHashMismatch &&
														verificationState === "failed"
													}
													sx={{
														px: 3,
														bgcolor: verificationResult?.isHashMismatch
															? "#FF6B6B"
															: "#F6D32D",
														color: "#0D1117",
														fontWeight: 600,
														"&:hover": {
															bgcolor: verificationResult?.isHashMismatch
																? "#ff8585"
																: "#f8db4e",
														},
														"&.Mui-disabled": {
															bgcolor: "rgba(255, 107, 107, 0.5)",
															color: "#0D1117",
														},
													}}
												>
													{verificationResult?.isHashMismatch
														? t("appDetails.securityContinueAnywayRisk")
														: t("appDetails.securityContinueAnyway")}
												</Button>
											</Box>

											<Button
												onClick={handleCloseUpdateDialog}
												sx={{
													color: "#8B949E",
													"&:hover": {
														color: "#C9D1D9",
													},
												}}
											>
												{t("appDetails.securityCancelInstallation")}
											</Button>
										</Box>
									)}

								{/* Verification Details (terminal-like view) */}
								{(verificationState === "failed" ||
									verificationState === "unsupported") &&
									showVerificationDetails && (
										<Box
											sx={{
												display: "flex",
												flexDirection: "column",
												alignItems: "center",
												justifyContent: "center",
												gap: 3,
												p: 4,
												minHeight: 300,
												bgcolor: "rgba(0, 0, 0, 0.2)",
												borderRadius: 2,
												border: `1px solid ${
													verificationResult?.isHashMismatch
														? "rgba(255, 107, 107, 0.5)"
														: "rgba(246, 211, 45, 0.5)"
												}`,
											}}
										>
											<Typography
												variant="h6"
												textAlign="center"
												sx={{ color: "#C9D1D9", fontWeight: 500 }}
											>
												{t("appDetails.securityVerificationDetails")}
											</Typography>

											<Box
												sx={{
													width: "100%",
													maxWidth: 600,
													maxHeight: 250,
													overflow: "auto",
													bgcolor: "rgba(0,0,0,0.3)",
													borderRadius: 1,
													p: 2,
													fontFamily:
														"'Fira Code', 'JetBrains Mono', monospace",
													fontSize: "0.85rem",
													color: "#8B949E",
													whiteSpace: "pre-wrap",
													wordBreak: "break-word",
												}}
											>
												{verificationResult && (
													<>
														<div
															style={{
																marginBottom: 8,
																color: verificationResult.isHashMismatch
																	? "#FF6B6B"
																	: "#F6D32D",
																fontWeight: 600,
															}}
														>
															{t(
																"appDetails.securityVerificationOverallStatus",
															)}
															:{" "}
															{verificationResult.verified
																? "✓"
																: verificationResult.isHashMismatch
																	? "✗"
																	: "⚠"}{" "}
															{verificationResult.verified
																? t("appDetails.securityVerificationVerified")
																: verificationResult.isHashMismatch
																	? t("appDetails.securityVerificationFailed")
																	: t("appDetails.securitySourceUnavailable")}
														</div>
														<div style={{ marginBottom: 8 }}>
															{t(
																"appDetails.securityVerificationSourcesChecked",
															)}
															:
														</div>
														{verificationResult.sources.map((s) => {
															const isHashMismatch =
																s.error
																	?.toLowerCase()
																	.includes("hash mismatch") ||
																s.error?.toLowerCase().includes("mismatch");
															return (
																<div
																	key={s.url}
																	style={{
																		marginBottom: 4,
																		paddingLeft: 8,
																	}}
																>
																	[
																	{s.verified
																		? "✓"
																		: isHashMismatch
																			? "✗"
																			: "⚠"}
																	] {s.url}
																	<br />
																	<span style={{ color: "#6E7681" }}>
																		{t(
																			"appDetails.securityVerificationCommitInManifest",
																		)}
																		: {s.commit || "N/A"}
																	</span>
																	{s.remote_commit && (
																		<>
																			<br />
																			<span style={{ color: "#6E7681" }}>
																				{t(
																					"appDetails.securityVerificationRemoteCommit",
																				)}
																				: {s.remote_commit}
																			</span>
																		</>
																	)}
																	{s.error && (
																		<>
																			<br />
																			<span
																				style={{
																					color: isHashMismatch
																						? "#FF6B6B"
																						: "#F6D32D",
																				}}
																			>
																				{t(
																					"appDetails.securityVerificationError",
																				)}
																				: {s.error}
																			</span>
																		</>
																	)}
																</div>
															);
														})}
														{verificationResult.error && (
															<div
																style={{
																	marginTop: 8,
																	color: verificationResult.isHashMismatch
																		? "#FF6B6B"
																		: "#F6D32D",
																}}
															>
																{t("appDetails.securityVerificationError")}:{" "}
																{verificationResult.error}
															</div>
														)}
													</>
												)}
											</Box>

											<Box sx={{ display: "flex", gap: 2 }}>
												<Button
													variant="contained"
													onClick={() => {
														setShowVerificationDetails(false);
													}}
													sx={{
														px: 3,
														bgcolor: "rgba(255, 255, 255, 0.1)",
														color: "#C9D1D9",
														border: "1px solid rgba(255, 255, 255, 0.3)",
														"&:hover": {
															bgcolor: "rgba(255, 255, 255, 0.2)",
														},
													}}
												>
													{t("myApps.hideDetails")}
												</Button>
											</Box>
										</Box>
									)}
							</>
						)}

						{/* Terminal View (shown after verification or when update is running) */}
						{updatingApp !== null && (
							<>
								<Typography variant="h6" gutterBottom>
									{t("myApps.updating", { appId: updatingApp })}
								</Typography>
								<Terminal output={updateOutput} isRunning={isUpdating} />
								{!isUpdating && (
									<Box
										sx={{
											display: "flex",
											justifyContent: "flex-end",
											mt: 2,
										}}
									>
										<Button
											variant="contained"
											onClick={handleCloseUpdateDialog}
										>
											{t("myApps.closeButton")}
										</Button>
									</Box>
								)}
							</>
						)}
					</DialogContent>
				</Dialog>

				{/* Uninstall Dialog */}
				<Dialog
					open={uninstallingApp !== null}
					onClose={!isUninstalling ? handleCloseUninstallDialog : undefined}
					maxWidth="md"
					fullWidth
				>
					<DialogContent>
						<Typography variant="h6" gutterBottom>
							{t("myApps.uninstalling", { appId: uninstallingApp })}
						</Typography>
						<Terminal output={uninstallOutput} isRunning={isUninstalling} />
						{!isUninstalling && (
							<Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
								<Button
									variant="contained"
									onClick={handleCloseUninstallDialog}
								>
									{t("myApps.closeButton")}
								</Button>
							</Box>
						)}
					</DialogContent>
				</Dialog>

				{/* Update All Modal */}
				<UpdateAllModal
					open={updateAllModalOpen}
					appsToVerify={installedApps
						.filter((app) => hasUpdate(app.appId))
						.map((app) => ({ appId: app.appId, appName: app.name }))}
					onClose={handleCloseUpdateAllModal}
					onProceedWithUpdate={executeUpdateAll}
					systemUpdatesCount={Math.max(
						0,
						updateCount -
							installedApps.filter((app) => hasUpdate(app.appId)).length,
					)}
					// Update phase props
					isUpdating={isUpdatingAll}
					updateOutput={updateAllOutput}
					showTerminal={showUpdateAllTerminal}
					onToggleTerminal={handleToggleUpdateAllTerminal}
					totalApps={updateAllProgress.totalApps}
					currentAppIndex={updateAllProgress.currentAppIndex}
					currentAppName={updateAllProgress.currentAppName}
					currentAppProgress={updateAllProgress.currentAppProgress}
					isUpdatingSystem={isUpdatingSystem}
					systemUpdateProgress={systemUpdateProgress}
					updateSuccessCount={updateSummary?.successCount ?? 0}
					updateErrorCount={updateSummary?.errorCount ?? 0}
				/>
			</Container>
		</Box>
	);
};
