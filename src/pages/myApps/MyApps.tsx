import { ArrowBack, Update } from "@mui/icons-material";
import {
	Box,
	Button,
	Container,
	Dialog,
	DialogContent,
	IconButton,
	Typography,
} from "@mui/material";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ReleaseNotesModal } from "../../components/ReleaseNotesModal";
import { Terminal } from "../../components/Terminal";
import { UpdateAllModal } from "../../components/UpdateAllModal";
import type { InstalledAppInfo } from "../../store/installedAppsStore";
import { useInstalledAppsStore } from "../../store/installedAppsStore";
import { checkAvailableUpdates } from "../../utils/updateChecker";
import { InstalledAppCard } from "./components/InstalledAppCard";

interface InstalledAppRust {
	app_id: string;
	name: string;
	version: string;
	summary?: string;
}

interface MyAppsProps {
	onBack: () => void;
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
			/>
		);
	},
);

export const MyApps = ({ onBack }: MyAppsProps) => {
	const { t } = useTranslation();

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

	const [selectedAppForNotes, setSelectedAppForNotes] = useState<string | null>(
		null,
	);
	const [updatingApp, setUpdatingApp] = useState<string | null>(null);
	const [updateOutput, setUpdateOutput] = useState<string[]>([]);
	const [isUpdating, setIsUpdating] = useState(false);
	const [uninstallingApp, setUninstallingApp] = useState<string | null>(null);
	const [uninstallOutput, setUninstallOutput] = useState<string[]>([]);
	const [isUninstalling, setIsUninstalling] = useState(false);

	// Update All states
	const [isUpdatingAll, setIsUpdatingAll] = useState(false);
	const [updateAllModalOpen, setUpdateAllModalOpen] = useState(false);
	const [updateAllProgress, setUpdateAllProgress] = useState({
		totalApps: 0,
		currentAppIndex: 0,
		currentAppName: "",
		currentAppProgress: 0,
	});
	const [updateAllOutput, setUpdateAllOutput] = useState<string[]>([]);
	const [showUpdateAllTerminal, setShowUpdateAllTerminal] = useState(false);

	// Fixed card height for consistent rendering
	const CARD_HEIGHT = 300;

	const reloadInstalledApps = useCallback(async () => {
		try {
			const apps = await invoke<InstalledAppRust[]>("get_installed_flatpaks");

			// Convert from Rust format to TypeScript format
			const installedAppsInfo: InstalledAppInfo[] = apps.map((app) => ({
				appId: app.app_id,
				name: app.name,
				version: app.version,
				summary: app.summary,
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

	// Listen to update and uninstall events
	useEffect(() => {
		const unlistenOutput = listen<string>("install-output", (event) => {
			const output = event.payload;

			// Check which operation is active and only update that output
			if (isUpdatingAll) {
				setUpdateAllOutput((prev) => [...prev, output]);

				// Parse flatpak progress for individual app progress
				// Format: "Actualizando X/Y…" or "Actualizando X/Y… ████ XX%"
				const progressMatch = output.match(/Actualizando\s+(\d+)\/(\d+)/);
				if (progressMatch) {
					const currentPart = Number.parseInt(progressMatch[1], 10);
					const totalParts = Number.parseInt(progressMatch[2], 10);

					// Check if there's a percentage
					const percentMatch = output.match(/(\d+)%/);
					let progress = 0;

					if (percentMatch) {
						const partProgress = Number.parseInt(percentMatch[1], 10);
						// Calculate overall progress: (completed parts + current part progress) / total parts
						progress = ((currentPart - 1) * 100 + partProgress) / totalParts;
					} else {
						// No percentage, just use completed parts
						progress = ((currentPart - 1) / totalParts) * 100;
					}

					setUpdateAllProgress((prev) => ({
						...prev,
						currentAppProgress: Math.min(100, Math.round(progress)),
					}));
				}
			} else if (updatingApp) {
				setUpdateOutput((prev) => [...prev, output]);
			} else if (uninstallingApp) {
				setUninstallOutput((prev) => [...prev, output]);
			}
		});

		const unlistenError = listen<string>("install-error", (event) => {
			if (isUpdatingAll) {
				setUpdateAllOutput((prev) => [...prev, `Error: ${event.payload}`]);
			} else if (updatingApp) {
				setUpdateOutput((prev) => [...prev, `Error: ${event.payload}`]);
			} else if (uninstallingApp) {
				setUninstallOutput((prev) => [...prev, `Error: ${event.payload}`]);
			}
		});

		const unlistenCompleted = listen<number>(
			"install-completed",
			async (event) => {
				if (isUpdatingAll) {
					// When updating all, individual app completion is handled by handleUpdateAll
					setIsUpdating(false);
				} else if (updatingApp) {
					setIsUpdating(false);
					if (event.payload === 0) {
						setUpdateOutput((prev) => [
							...prev,
							"",
							t("myApps.updateCompletedSuccess"),
							t("myApps.reloadingUpdateList"),
						]);
						// Reload available updates after successful update
						await reloadAvailableUpdates();
						setUpdateOutput((prev) => [...prev, t("myApps.listUpdated")]);
					} else {
						setUpdateOutput((prev) => [
							...prev,
							"",
							t("myApps.updateFailed", { code: event.payload }),
						]);
					}
				} else if (uninstallingApp) {
					setIsUninstalling(false);
					if (event.payload === 0) {
						setUninstallOutput((prev) => [
							...prev,
							"",
							t("myApps.uninstallCompletedSuccess"),
						]);
					} else {
						setUninstallOutput((prev) => [
							...prev,
							"",
							t("myApps.uninstallFailed", { code: event.payload }),
						]);
					}
				}
			},
		);

		return () => {
			unlistenOutput.then((fn) => fn());
			unlistenError.then((fn) => fn());
			unlistenCompleted.then((fn) => fn());
		};
	}, [updatingApp, uninstallingApp, isUpdatingAll, reloadAvailableUpdates, t]);

	const handleCloseModal = useCallback(() => {
		setSelectedAppForNotes(null);
	}, []);

	const handleShowReleaseNotes = useCallback((appId: string) => {
		setSelectedAppForNotes(appId);
	}, []);

	const handleUpdate = useCallback(
		async (appId: string) => {
			setUpdatingApp(appId);
			setIsUpdating(true);
			setUpdateOutput([t("myApps.preparingUpdate", { appId }), ""]);

			try {
				await invoke("update_flatpak", { appId });
			} catch (error) {
				setIsUpdating(false);
				setUpdateOutput((prev) => [
					...prev,
					"",
					t("myApps.errorInvokingCommand", { error }),
				]);
			}
		},
		[t],
	);

	const handleCloseUpdateDialog = useCallback(() => {
		setUpdatingApp(null);
		setUpdateOutput([]);
	}, []);

	const handleUninstall = useCallback(
		async (appId: string) => {
			setUninstallingApp(appId);
			setIsUninstalling(true);
			setUninstallOutput([t("myApps.preparingUninstall", { appId }), ""]);

			try {
				await invoke("uninstall_flatpak", { appId });
			} catch (error) {
				setIsUninstalling(false);
				setUninstallOutput((prev) => [
					...prev,
					"",
					t("myApps.errorInvokingCommand", { error }),
				]);
			}
		},
		[t],
	);

	const handleCloseUninstallDialog = useCallback(async () => {
		setUninstallingApp(null);
		setUninstallOutput([]);
		// Reload installed apps list after uninstall
		await reloadInstalledApps();
	}, [reloadInstalledApps]);

	const handleUpdateAll = useCallback(async () => {
		// Get all apps that need updates
		const appsToUpdate = installedApps.filter((app) => hasUpdate(app.appId));

		if (appsToUpdate.length === 0) return;

		setUpdateAllModalOpen(true);
		setIsUpdatingAll(true);
		setUpdateAllOutput([]);
		setUpdateAllProgress({
			totalApps: appsToUpdate.length,
			currentAppIndex: 0,
			currentAppName: "",
			currentAppProgress: 0,
		});

		let errorCount = 0;

		for (let i = 0; i < appsToUpdate.length; i++) {
			const app = appsToUpdate[i];

			// Update progress for current app
			setUpdateAllProgress({
				totalApps: appsToUpdate.length,
				currentAppIndex: i,
				currentAppName: app.name,
				currentAppProgress: 0,
			});

			setUpdateAllOutput((prev) => [
				...prev,
				"",
				`[${i + 1}/${appsToUpdate.length}] ${t("myApps.preparingUpdate", { appId: app.appId })}`,
			]);

			try {
				// Set this app as currently updating
				setUpdatingApp(app.appId);

				// Start the update
				await invoke("update_flatpak", { appId: app.appId });

				// Wait for completion (the event listener will handle progress)
				// This is a simple approach - in production you might want a promise-based approach
				await new Promise((resolve) => {
					const checkCompletion = setInterval(() => {
						if (!isUpdating) {
							clearInterval(checkCompletion);
							resolve(undefined);
						}
					}, 100);
				});

				setUpdateAllOutput((prev) => [
					...prev,
					t("myApps.updateCompletedSuccess"),
				]);
			} catch (error) {
				errorCount++;
				setUpdateAllOutput((prev) => [
					...prev,
					t("myApps.errorInvokingCommand", { error }),
				]);
			} finally {
				setUpdatingApp(null);
			}

			// Update progress
			setUpdateAllProgress({
				totalApps: appsToUpdate.length,
				currentAppIndex: i + 1,
				currentAppName: "",
				currentAppProgress: 100,
			});
		}

		// All updates completed
		setIsUpdatingAll(false);
		if (errorCount === 0) {
			setUpdateAllOutput((prev) => [
				...prev,
				"",
				t("myApps.allUpdatesCompleted"),
			]);
		} else {
			setUpdateAllOutput((prev) => [
				...prev,
				"",
				t("myApps.updatesCompletedWithErrors"),
			]);
		}

		// Reload updates list
		await reloadAvailableUpdates();
	}, [installedApps, hasUpdate, isUpdating, reloadAvailableUpdates, t]);

	const handleCloseUpdateAllModal = useCallback(() => {
		setUpdateAllModalOpen(false);
		setUpdateAllOutput([]);
		setShowUpdateAllTerminal(false);
	}, []);

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
		<Container maxWidth="xl">
			<Box sx={{ py: 4, minHeight: "100vh" }}>
				{/* Back button */}
				<Box sx={{ mb: 3, display: "flex", alignItems: "center", gap: 2 }}>
					<IconButton onClick={onBack}>
						<ArrowBack />
					</IconButton>
					<Typography variant="h4" fontWeight="bold">
						{t("myApps.title")}
					</Typography>
				</Box>

				{/* Installed apps count and Update All button */}
				<Box
					sx={{
						mb: 4,
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
					}}
				>
					<Typography variant="body1" color="text.secondary">
						{installedApps.length === 1
							? t("myApps.appInstalled", { count: installedApps.length })
							: t("myApps.appsInstalled", { count: installedApps.length })}
					</Typography>

					{updateCount > 0 && (
						<Button
							variant="contained"
							color="primary"
							startIcon={<Update />}
							onClick={handleUpdateAll}
							disabled={isUpdatingAll}
						>
							{updateCount === 1
								? t("myApps.updateAllCount", { count: updateCount })
								: t("myApps.updateAllCount_plural", { count: updateCount })}
						</Button>
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
								key={app.appId}
								app={app}
								hasUpdate={hasUpdate(app.appId)}
								isUpdating={isUpdating && updatingApp === app.appId}
								isUninstalling={isUninstalling && uninstallingApp === app.appId}
								cardHeight={CARD_HEIGHT}
								onUpdate={handleUpdate}
								onUninstall={handleUninstall}
								onShowReleaseNotes={handleShowReleaseNotes}
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
				/>
			</Box>
		</Container>
	);
};
