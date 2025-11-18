import { ArrowBack, Delete, Description } from "@mui/icons-material";
import {
	Box,
	Button,
	Card,
	CardContent,
	Container,
	Dialog,
	DialogContent,
	IconButton,
	Typography,
} from "@mui/material";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CachedImage } from "../../components/CachedImage";
import { ReleaseNotesModal } from "../../components/ReleaseNotesModal";
import { Terminal } from "../../components/Terminal";
import type { InstalledAppInfo } from "../../store/installedAppsStore";
import { useInstalledAppsStore } from "../../store/installedAppsStore";
import { checkAvailableUpdates } from "../../utils/updateChecker";

interface InstalledAppRust {
	app_id: string;
	name: string;
	version: string;
}

interface MyAppsProps {
	onBack: () => void;
}

export const MyApps = ({ onBack }: MyAppsProps) => {
	const { t } = useTranslation();
	const {
		getInstalledAppsInfo,
		hasUpdate,
		getUpdateInfo,
		setAvailableUpdates,
		setInstalledAppsInfo,
	} = useInstalledAppsStore();
	const installedApps = getInstalledAppsInfo();
	const [selectedAppForNotes, setSelectedAppForNotes] = useState<string | null>(
		null,
	);
	const [updatingApp, setUpdatingApp] = useState<string | null>(null);
	const [updateOutput, setUpdateOutput] = useState<string[]>([]);
	const [isUpdating, setIsUpdating] = useState(false);
	const [uninstallingApp, setUninstallingApp] = useState<string | null>(null);
	const [uninstallOutput, setUninstallOutput] = useState<string[]>([]);
	const [isUninstalling, setIsUninstalling] = useState(false);

	const reloadInstalledApps = useCallback(async () => {
		try {
			const apps = await invoke<InstalledAppRust[]>("get_installed_flatpaks");

			// Convert from Rust format to TypeScript format
			const installedAppsInfo: InstalledAppInfo[] = apps.map((app) => ({
				appId: app.app_id,
				name: app.name,
				version: app.version,
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
			// Check which operation is active and only update that output
			if (updatingApp) {
				setUpdateOutput((prev) => [...prev, event.payload]);
			} else if (uninstallingApp) {
				setUninstallOutput((prev) => [...prev, event.payload]);
			}
		});

		const unlistenError = listen<string>("install-error", (event) => {
			if (updatingApp) {
				setUpdateOutput((prev) => [...prev, `Error: ${event.payload}`]);
			} else if (uninstallingApp) {
				setUninstallOutput((prev) => [...prev, `Error: ${event.payload}`]);
			}
		});

		const unlistenCompleted = listen<number>(
			"install-completed",
			async (event) => {
				if (updatingApp) {
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
	}, [updatingApp, uninstallingApp, reloadAvailableUpdates, t]);

	const handleCloseModal = () => {
		setSelectedAppForNotes(null);
	};

	const handleUpdate = async (appId: string) => {
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
	};

	const handleCloseUpdateDialog = () => {
		setUpdatingApp(null);
		setUpdateOutput([]);
	};

	const handleUninstall = async (appId: string) => {
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
	};

	const handleCloseUninstallDialog = async () => {
		setUninstallingApp(null);
		setUninstallOutput([]);
		// Reload installed apps list after uninstall
		await reloadInstalledApps();
	};

	// Get selected app info for modal
	const selectedApp = installedApps.find(
		(app) => app.appId === selectedAppForNotes,
	);
	const updateInfo = selectedAppForNotes
		? getUpdateInfo(selectedAppForNotes)
		: undefined;

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

				{/* Installed apps count */}
				<Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
					{installedApps.length === 1
						? t("myApps.appInstalled", { count: installedApps.length })
						: t("myApps.appsInstalled", { count: installedApps.length })}
				</Typography>

				{/* Apps grid */}
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
							<Card
								key={app.appId}
								sx={{
									height: "100%",
									display: "flex",
									flexDirection: "column",
									boxSizing: "border-box",
									minWidth: 0,
									overflow: "hidden",
									transition: "box-shadow 0.3s",
									"&:hover": { boxShadow: 6 },
								}}
							>
								<Box
									sx={{
										p: 2,
										display: "flex",
										flexDirection: "column",
										alignItems: "center",
										gap: 2,
										minHeight: 150,
										bgcolor: "background.paper",
									}}
								>
									{/* App Icon */}
									<Box
										sx={{
											width: 80,
											height: 80,
											flexShrink: 0,
											borderRadius: 2,
											overflow: "hidden",
											bgcolor: "grey.800",
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
										}}
									>
										<CachedImage
											appId={app.appId}
											imageUrl={`https://dl.flathub.org/repo/appstream/x86_64/icons/128x128/${app.appId}.png`}
											alt={app.name}
											variant="rounded"
											style={{
												width: "100%",
												height: "100%",
												objectFit: "cover",
											}}
										/>
									</Box>

									{/* App Name */}
									<Typography
										variant="body1"
										fontWeight="bold"
										textAlign="center"
										sx={{
											overflow: "hidden",
											textOverflow: "ellipsis",
											display: "-webkit-box",
											WebkitLineClamp: 2,
											WebkitBoxOrient: "vertical",
											minHeight: "2.5em",
										}}
									>
										{app.name}
									</Typography>
								</Box>

								<CardContent sx={{ flexGrow: 1, pt: 1 }}>
									{/* App ID */}
									<Typography
										variant="caption"
										color="text.secondary"
										sx={{
											display: "block",
											mb: 1,
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
										}}
									>
										{app.appId}
									</Typography>

									{/* Version and Action Buttons */}
									<Box
										sx={{
											display: "flex",
											justifyContent: "space-between",
											alignItems: "center",
											gap: 1,
										}}
									>
										<Typography
											variant="caption"
											color="primary"
											sx={{
												fontWeight: "bold",
											}}
										>
											v{app.version}
										</Typography>

										<Box
											sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
										>
											{/* Release Notes Icon - only show if update available */}
											{hasUpdate(app.appId) && (
												<IconButton
													size="small"
													onClick={() => setSelectedAppForNotes(app.appId)}
													sx={{
														p: 0.5,
														"&:hover": {
															color: "primary.main",
														},
													}}
												>
													<Description fontSize="small" />
												</IconButton>
											)}

											{/* Uninstall Icon */}
											<IconButton
												size="small"
												onClick={() => handleUninstall(app.appId)}
												disabled={isUninstalling && uninstallingApp === app.appId}
												sx={{
													p: 0.5,
													bgcolor: "error.main",
													color: "white",
													"&:hover": {
														bgcolor: "error.dark",
													},
													"&.Mui-disabled": {
														bgcolor: "grey.500",
														color: "grey.300",
													},
												}}
											>
												<Delete fontSize="small" />
											</IconButton>

											{/* Update Button - only show if update available */}
											{hasUpdate(app.appId) && (
												<Button
													variant="contained"
													size="small"
													onClick={() => handleUpdate(app.appId)}
													disabled={isUpdating && updatingApp === app.appId}
													sx={{
														minWidth: "auto",
														px: 1.5,
														py: 0.5,
														fontSize: "0.7rem",
														textTransform: "none",
													}}
												>
													{isUpdating && updatingApp === app.appId
														? t("appDetails.updating")
														: t("appDetails.update")}
												</Button>
											)}
										</Box>
									</Box>
								</CardContent>
							</Card>
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
								<Button variant="contained" onClick={handleCloseUninstallDialog}>
									{t("myApps.closeButton")}
								</Button>
							</Box>
						)}
					</DialogContent>
				</Dialog>
			</Box>
		</Container>
	);
};
