import { ArrowBack, InfoOutlined, SystemUpdateAlt } from "@mui/icons-material";
import {
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
	alpha,
	useTheme,
} from "@mui/material";
import { invoke } from "@tauri-apps/api/core";
import { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ReleaseNotesModal } from "../../components/ReleaseNotesModal";
import { Terminal } from "../../components/Terminal";
import { UpdateAllModal } from "../../components/UpdateAllModal";
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
	const getUpdateInfo = useInstalledAppsStore((state) => state.getUpdateInfo);
	const setAvailableUpdates = useInstalledAppsStore(
		(state) => state.setAvailableUpdates,
	);
	const setInstalledAppsInfo = useInstalledAppsStore(
		(state) => state.setInstalledAppsInfo,
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
	const {
		updateApp,
		updatingApp,
		isUpdating,
		updateOutput,
		clearUpdate,
	} = useUpdateApp();

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
		systemUpdatesCount,
		isUpdatingSystem,
		systemUpdateProgress,
		clearUpdateAll,
	} = useUpdateAll();

	const reloadInstalledApps = useCallback(async () => {
		try {
			const apps = await invoke<InstalledAppRust[]>("get_installed_flatpaks");

			// Convert from Rust format to TypeScript format
			const installedAppsInfo: InstalledAppInfo[] = apps.map((app) => ({
				appId: app.app_id,
				name: app.name,
				version: app.version,
				summary: app.summary,
				developer: app.developer,
			}));

			setInstalledAppsInfo(installedAppsInfo);

			// After loading installed apps, check for available updates
			const updates = await checkAvailableUpdates();
			setAvailableUpdates(updates);
		} catch (error) {
			console.error("Error reloading installed apps:", error);
		}
	}, [setInstalledAppsInfo, setAvailableUpdates]);

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

	const handleUpdate = useCallback(
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

	const handleCloseUpdateDialog = useCallback(() => {
		clearUpdate();
	}, [clearUpdate]);

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

	const handleUpdateAll = useCallback(async () => {
		// Get all apps that need updates
		const appsToUpdate = installedApps.filter((app) => hasUpdate(app.appId));
		const initialSystemUpdates = updateCount - appsToUpdate.length;

		if (appsToUpdate.length === 0 && initialSystemUpdates === 0) return;

		// Open modal
		setUpdateAllModalOpen(true);

		// Execute update all using the hook
		await updateAll(appsToUpdate, initialSystemUpdates);

		// Reload updates list after completion
		await reloadAvailableUpdates();
	}, [installedApps, hasUpdate, updateCount, updateAll, reloadAvailableUpdates]);

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
								disabled={isUpdatingAll || isReloadingUpdates || isLoadingUpdates}
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
						{installedApps.map((app) => (
							<AppCardWrapper
								key={`${app.appId}-${app.name}`}
								app={app}
								hasUpdate={hasUpdate(app.appId)}
								isUpdating={isUpdating && updatingApp === app.appId}
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

				{/* Update Dialog */}
				<Dialog
					open={updatingApp !== null}
					onClose={!isUpdating ? handleCloseUpdateDialog : undefined}
					maxWidth="md"
					fullWidth
				>
					<DialogContent>
						<Typography variant="h6" gutterBottom>
							{t("myApps.updating", { appId: updatingApp })}
						</Typography>
						<Terminal output={updateOutput} isRunning={isUpdating} />
						{!isUpdating && (
							<Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
								<Button variant="contained" onClick={handleCloseUpdateDialog}>
									{t("myApps.closeButton")}
								</Button>
							</Box>
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
					totalApps={updateAllProgress.totalApps}
					currentAppIndex={updateAllProgress.currentAppIndex}
					currentAppName={updateAllProgress.currentAppName}
					currentAppProgress={updateAllProgress.currentAppProgress}
					output={updateAllOutput}
					isUpdating={isUpdatingAll}
					onClose={handleCloseUpdateAllModal}
					showTerminal={showUpdateAllTerminal}
					onToggleTerminal={handleToggleUpdateAllTerminal}
					systemUpdatesCount={systemUpdatesCount}
					isUpdatingSystem={isUpdatingSystem}
					systemUpdateProgress={systemUpdateProgress}
				/>
			</Container>
		</Box>
	);
};
