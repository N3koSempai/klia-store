import {
	DeleteOutline,
	DownloadOutlined,
	Extension as ExtensionIcon,
} from "@mui/icons-material";
import {
	Box,
	Button,
	CircularProgress,
	IconButton,
	List,
	ListItem,
	Popover,
	Stack,
	Typography,
	alpha,
	useTheme,
} from "@mui/material";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useAppExtensions } from "../hooks/useAppExtensions";
import type { InstalledExtensionInfo } from "../store/installedAppsStore";
import { useInstalledAppsStore } from "../store/installedAppsStore";
import {
	installExtension,
	uninstallExtension,
} from "../utils/flatpakOperations";

interface InstalledExtensionRust {
	extension_id: string;
	name: string;
	version: string;
	parent_app_id: string;
}

interface ExtensionsPopoverProps {
	appId: string;
	anchorEl: HTMLElement | null;
	open: boolean;
	onClose: () => void;
}

interface ExtensionState {
	isInstalling: boolean;
	isUninstalling: boolean;
	progress: number;
}

export const ExtensionsPopover = ({
	appId,
	anchorEl,
	open,
	onClose,
}: ExtensionsPopoverProps) => {
	const theme = useTheme();
	const { availableExtensions, isLoading, error, fetchExtensions } =
		useAppExtensions();
	const getInstalledExtensionsForApp = useInstalledAppsStore(
		(state) => state.getInstalledExtensionsForApp,
	);
	const setInstalledExtensions = useInstalledAppsStore(
		(state) => state.setInstalledExtensions,
	);

	// Track state for each extension
	const [extensionStates, setExtensionStates] = useState<
		Record<string, ExtensionState>
	>({});

	// Fetch extensions when popover opens
	useEffect(() => {
		if (open && appId) {
			fetchExtensions(appId);
		}
	}, [open, appId, fetchExtensions]);

	// Get installed extensions for this app
	const installedExtensions = getInstalledExtensionsForApp(appId);

	// Mark available extensions as installed if they exist in installed list
	const extensionsWithStatus = availableExtensions.map((ext) => ({
		...ext,
		isInstalled: installedExtensions.some(
			(installed: InstalledExtensionInfo) =>
				installed.extensionId === ext.extensionId,
		),
	}));

	const handleInstall = async (extensionId: string) => {
		setExtensionStates((prev) => ({
			...prev,
			[extensionId]: { isInstalling: true, isUninstalling: false, progress: -1 },
		}));

		try {
			const result = await installExtension(extensionId, (progressData) => {
				// Parse progress from output if available
				const progressMatch = progressData.output.match(/(\d+)%/);
				if (progressMatch) {
					const progress = Number.parseInt(progressMatch[1], 10);
					setExtensionStates((prev) => ({
						...prev,
						[extensionId]: {
							...prev[extensionId],
							progress: Math.min(100, progress),
						},
					}));
				} else {
					// If no percentage found, keep indeterminate progress
					setExtensionStates((prev) => ({
						...prev,
						[extensionId]: {
							...prev[extensionId],
							progress: prev[extensionId]?.progress ?? -1,
						},
					}));
				}
			});

			if (result.success) {
				// Reload installed extensions from system
				try {
					const response = await invoke<{ extensions: InstalledExtensionRust[] }>(
						"get_installed_flatpaks",
					);
					const installedExtensionsInfo = response.extensions.map((ext) => ({
						extensionId: ext.extension_id,
						name: ext.name,
						version: ext.version,
						parentAppId: ext.parent_app_id,
					}));
					setInstalledExtensions(installedExtensionsInfo);
				} catch (error) {
					console.error("[ExtensionsPopover] Error reloading extensions:", error);
				}

				// Mark as finished installing
				setExtensionStates((prev) => ({
					...prev,
					[extensionId]: { isInstalling: false, isUninstalling: false, progress: 100 },
				}));
			} else {
				// Installation failed
				setExtensionStates((prev) => ({
					...prev,
					[extensionId]: { isInstalling: false, isUninstalling: false, progress: 0 },
				}));
			}
		} catch (err) {
			console.error("[ExtensionsPopover] Error installing extension:", err);
			// Reset state on error
			setExtensionStates((prev) => ({
				...prev,
				[extensionId]: { isInstalling: false, isUninstalling: false, progress: 0 },
			}));
		}
	};

	const handleUninstall = async (extensionId: string) => {
		setExtensionStates((prev) => ({
			...prev,
			[extensionId]: {
				isInstalling: false,
				isUninstalling: true,
				progress: -1,
			},
		}));

		try {
			const result = await uninstallExtension(extensionId, (progressData) => {
				// Parse progress from output if available
				const progressMatch = progressData.output.match(/(\d+)%/);
				if (progressMatch) {
					const progress = Number.parseInt(progressMatch[1], 10);
					setExtensionStates((prev) => ({
						...prev,
						[extensionId]: {
							...prev[extensionId],
							progress: Math.min(100, progress),
						},
					}));
				} else {
					// If no percentage found, keep indeterminate progress
					setExtensionStates((prev) => ({
						...prev,
						[extensionId]: {
							...prev[extensionId],
							progress: prev[extensionId]?.progress ?? -1,
						},
					}));
				}
			});

			if (result.success) {
				// Reload installed extensions from system
				try {
					const response = await invoke<{ extensions: InstalledExtensionRust[] }>(
						"get_installed_flatpaks",
					);
					const installedExtensionsInfo = response.extensions.map((ext) => ({
						extensionId: ext.extension_id,
						name: ext.name,
						version: ext.version,
						parentAppId: ext.parent_app_id,
					}));
					setInstalledExtensions(installedExtensionsInfo);
				} catch (error) {
					console.error("[ExtensionsPopover] Error reloading extensions:", error);
				}

				// Mark as finished uninstalling
				setExtensionStates((prev) => ({
					...prev,
					[extensionId]: {
						isInstalling: false,
						isUninstalling: false,
						progress: 0,
					},
				}));
			} else {
				// Uninstallation failed
				setExtensionStates((prev) => ({
					...prev,
					[extensionId]: {
						isInstalling: false,
						isUninstalling: false,
						progress: 0,
					},
				}));
			}
		} catch (err) {
			console.error("Error uninstalling extension:", err);
			// Reset state on error
			setExtensionStates((prev) => ({
				...prev,
				[extensionId]: {
					isInstalling: false,
					isUninstalling: false,
					progress: 0,
				},
			}));
		}
	};

	return (
		<Popover
			open={open}
			anchorEl={anchorEl}
			onClose={onClose}
			anchorOrigin={{
				vertical: "bottom",
				horizontal: "right",
			}}
			transformOrigin={{
				vertical: "top",
				horizontal: "right",
			}}
			slotProps={{
				paper: {
					sx: {
						mt: 1,
						minWidth: 320,
						maxWidth: 400,
						borderRadius: 2,
						boxShadow: `0 8px 32px ${alpha(theme.palette.common.black, 0.2)}`,
					},
				},
			}}
		>
			<Box sx={{ p: 2 }}>
				<Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
					<ExtensionIcon sx={{ color: "primary.main" }} />
					<Typography variant="h6" sx={{ fontWeight: 600 }}>
						Extensions
					</Typography>
				</Stack>

				{isLoading && (
					<Box
						sx={{
							display: "flex",
							justifyContent: "center",
							alignItems: "center",
							py: 4,
						}}
					>
						<CircularProgress size={32} />
					</Box>
				)}

				{error && (
					<Typography
						variant="body2"
						color="error"
						sx={{ py: 2, textAlign: "center" }}
					>
						Error loading extensions: {error}
					</Typography>
				)}

				{!isLoading && !error && extensionsWithStatus.length === 0 && (
					<Typography
						variant="body2"
						color="text.secondary"
						sx={{ py: 2, textAlign: "center" }}
					>
						No extensions available
					</Typography>
				)}

				{!isLoading && !error && extensionsWithStatus.length > 0 && (
					<List sx={{ p: 0 }}>
						{extensionsWithStatus.map((ext) => {
							const state = extensionStates[ext.extensionId] || {
								isInstalling: false,
								isUninstalling: false,
								progress: 0,
							};

							return (
								<ListItem
									key={ext.extensionId}
									sx={{
										px: 0,
										py: 1.5,
										borderBottom: `1px solid ${theme.palette.divider}`,
										"&:last-child": {
											borderBottom: "none",
										},
									}}
								>
									<Stack
										direction="row"
										justifyContent="space-between"
										alignItems="center"
										sx={{ width: "100%" }}
									>
										<Box sx={{ flex: 1, mr: 2 }}>
											<Typography
												variant="body2"
												sx={{ fontWeight: 500, wordBreak: "break-word" }}
											>
												{ext.name}
											</Typography>
											{ext.version && (
												<Typography variant="caption" color="text.secondary">
													v{ext.version}
												</Typography>
											)}
										</Box>

										<Stack direction="row" spacing={1} alignItems="center">
											{ext.isInstalled && !state.isUninstalling ? (
												<>
													<Button
														variant="outlined"
														size="small"
														disabled
														sx={{
															textTransform: "none",
															minWidth: 80,
															borderColor: "success.main",
															color: "success.main",
															"&.Mui-disabled": {
																borderColor: alpha(
																	theme.palette.success.main,
																	0.5,
																),
																color: alpha(theme.palette.success.main, 0.5),
															},
														}}
													>
														Installed
													</Button>
													<IconButton
														size="small"
														disabled={state.isUninstalling}
														sx={{
															color: "text.secondary",
															"&:hover": {
																color: "error.main",
																bgcolor: alpha(theme.palette.error.main, 0.1),
															},
															"&.Mui-disabled": {
																color: "grey.500",
															},
														}}
														onClick={() => handleUninstall(ext.extensionId)}
													>
														<DeleteOutline fontSize="small" />
													</IconButton>
												</>
											) : state.isUninstalling ? (
												<Button
													variant="outlined"
													size="small"
													disabled
													sx={{
														textTransform: "none",
														minWidth: 100,
														position: "relative",
														overflow: "hidden",
														borderColor: "error.main",
														color: "error.main",
														"&::before": state.progress >= 0 ? {
															content: '""',
															position: "absolute",
															left: 0,
															top: 0,
															bottom: 0,
															width: `${state.progress}%`,
															backgroundColor: alpha(
																theme.palette.error.main,
																0.3,
															),
															transition: "width 0.3s ease",
														} : undefined,
													}}
												>
													<span style={{ position: "relative", zIndex: 1 }}>
														Uninstalling
													</span>
												</Button>
											) : state.isInstalling ? (
												<Button
													variant="outlined"
													size="small"
													disabled
													sx={{
														textTransform: "none",
														minWidth: 100,
														position: "relative",
														overflow: "hidden",
														borderColor: "success.main",
														color: "success.main",
														"&::before": state.progress >= 0 ? {
															content: '""',
															position: "absolute",
															left: 0,
															top: 0,
															bottom: 0,
															width: `${state.progress}%`,
															backgroundColor: alpha(
																theme.palette.success.main,
																0.3,
															),
															transition: "width 0.3s ease",
														} : undefined,
													}}
												>
													<span style={{ position: "relative", zIndex: 1 }}>
														Installing
													</span>
												</Button>
											) : (
												<Button
													variant="outlined"
													size="small"
													startIcon={<DownloadOutlined />}
													sx={{
														textTransform: "none",
														minWidth: 80,
														borderColor: "primary.main",
														color: "primary.main",
														"&:hover": {
															borderColor: "primary.dark",
															bgcolor: alpha(theme.palette.primary.main, 0.05),
														},
													}}
													onClick={() => handleInstall(ext.extensionId)}
												>
													Install
												</Button>
											)}
										</Stack>
									</Stack>
								</ListItem>
							);
						})}
					</List>
				)}
			</Box>
		</Popover>
	);
};
