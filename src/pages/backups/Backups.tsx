import {
	ArrowBack,
	Backup as BackupIcon,
	Delete,
	InsertDriveFile,
	Restore,
	SettingsBackupRestore,
} from "@mui/icons-material";
import SearchIcon from "@mui/icons-material/Search";
import {
	alpha,
	Box,
	Button,
	Checkbox,
	Chip,
	Container,
	Dialog,
	DialogContent,
	IconButton,
	InputAdornment,
	LinearProgress,
	Stack,
	Tab,
	Tabs,
	TextField,
	Typography,
	useTheme,
} from "@mui/material";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Terminal } from "../../components/Terminal";
import { useBackups } from "../../hooks/useBackups";
import { useInstalledAppsStore } from "../../store/installedAppsStore";
import type { BackupAppRequest } from "../../types";

interface BackupsProps {
	onBack: () => void;
}

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const units = ["B", "KB", "MB", "GB"];
	const exponent = Math.min(
		Math.floor(Math.log(bytes) / Math.log(1024)),
		units.length - 1,
	);
	const value = bytes / 1024 ** exponent;
	return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export const Backups = ({ onBack }: BackupsProps) => {
	const { t } = useTranslation();
	const theme = useTheme();

	const installedApps = useInstalledAppsStore(
		(state) => state.installedAppsInfo,
	);

	const [activeTab, setActiveTab] = useState<"backup" | "restore">("backup");
	const [downloadsDir, setDownloadsDir] = useState<string | null>(null);
	const [lastBackupPath, setLastBackupPath] = useState<string | null>(null);

	// --- Backup tab state ---
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedAppIds, setSelectedAppIds] = useState<Set<string>>(new Set());
	// Per-app data/runtime inclusion options, keyed by appId — each app can have
	// its own choice since one app's data may matter while another's doesn't.
	const [appOptions, setAppOptions] = useState<
		Record<string, { includeData: boolean; includeRuntime: boolean }>
	>({});
	const [createDialogOpen, setCreateDialogOpen] = useState(false);

	// --- Restore tab state: the source archive is picked explicitly, since
	// restoring normally happens on a different machine than the one that
	// created the backup — there's no fixed local location to list.
	const [restoreSourcePath, setRestoreSourcePath] = useState<string | null>(
		null,
	);
	const [isDragOver, setIsDragOver] = useState(false);

	const {
		backups,
		isLoadingBackups,
		reloadBackups,
		isCreatingBackup,
		createProgress,
		compressProgress,
		createBackup,
		clearCreateBackup,
		restoringArchivePath,
		isRestoringBackup,
		restoreProgress,
		restoreBackup,
		clearRestoreBackup,
		deleteBackup,
	} = useBackups();

	useEffect(() => {
		invoke<string>("get_downloads_dir").then((dir) => {
			setDownloadsDir(dir);
		});
	}, []);

	// Drag & drop a .klia-backup.tar.zst file anywhere on the restore tab
	// picks it as the source.
	const activeTabRef = useRef(activeTab);
	activeTabRef.current = activeTab;
	useEffect(() => {
		const unlistenPromise = getCurrentWebview().onDragDropEvent((event) => {
			if (event.payload.type !== "drop") return;
			if (activeTabRef.current !== "restore") return;
			const [firstPath] = event.payload.paths;
			if (firstPath) {
				setRestoreSourcePath(firstPath);
			}
		});
		return () => {
			unlistenPromise.then((unlisten) => unlisten());
		};
	}, []);

	useEffect(() => {
		if (restoreSourcePath) {
			reloadBackups(restoreSourcePath);
		}
	}, [restoreSourcePath, reloadBackups]);

	const filteredApps = useMemo(() => {
		const query = searchQuery.trim().toLowerCase();
		const apps = query
			? installedApps.filter(
					(app) =>
						app.name.toLowerCase().includes(query) ||
						app.appId.toLowerCase().includes(query),
				)
			: installedApps;
		return [...apps].sort((a, b) => a.name.localeCompare(b.name));
	}, [installedApps, searchQuery]);

	const toggleAppSelected = useCallback((appId: string) => {
		setSelectedAppIds((prev) => {
			const next = new Set(prev);
			if (next.has(appId)) {
				next.delete(appId);
			} else {
				next.add(appId);
			}
			return next;
		});
	}, []);

	const allFilteredSelected =
		filteredApps.length > 0 &&
		filteredApps.every((app) => selectedAppIds.has(app.appId));

	const toggleSelectAllFiltered = useCallback(() => {
		setSelectedAppIds((prev) => {
			const next = new Set(prev);
			if (allFilteredSelected) {
				for (const app of filteredApps) {
					next.delete(app.appId);
				}
			} else {
				for (const app of filteredApps) {
					next.add(app.appId);
				}
			}
			return next;
		});
	}, [allFilteredSelected, filteredApps]);

	const toggleAppOption = useCallback(
		(appId: string, key: "includeData" | "includeRuntime") => {
			setAppOptions((prev) => ({
				...prev,
				[appId]: {
					includeData: prev[appId]?.includeData ?? false,
					includeRuntime: prev[appId]?.includeRuntime ?? false,
					[key]: !(prev[appId]?.[key] ?? false),
				},
			}));
		},
		[],
	);

	const handleCreateBackup = useCallback(async () => {
		if (!downloadsDir || selectedAppIds.size === 0) return;
		setCreateDialogOpen(true);
		const apps: BackupAppRequest[] = Array.from(selectedAppIds).map(
			(appId) => ({
				app_id: appId,
				include_data: appOptions[appId]?.includeData ?? false,
				include_runtime: appOptions[appId]?.includeRuntime ?? false,
			}),
		);
		const session = await createBackup(downloadsDir, apps);
		if (session) {
			setSelectedAppIds(new Set());
			setLastBackupPath(
				`${downloadsDir}/${session.session_id}.klia-backup.tar.zst`,
			);
		}
	}, [downloadsDir, selectedAppIds, appOptions, createBackup]);

	const handleCloseCreateDialog = useCallback(() => {
		setCreateDialogOpen(false);
		clearCreateBackup();
	}, [clearCreateBackup]);

	const handlePickRestoreSource = useCallback(async () => {
		const selected = await open({
			multiple: false,
			filters: [{ name: "Klia Store Backup", extensions: ["zst", "tar.zst"] }],
		});
		if (typeof selected === "string") {
			setRestoreSourcePath(selected);
		}
	}, []);

	const handleRestore = useCallback(
		async (archivePath: string) => {
			await restoreBackup(archivePath);
		},
		[restoreBackup],
	);

	const handleCloseRestoreDialog = useCallback(async () => {
		clearRestoreBackup();
		if (restoreSourcePath) {
			await reloadBackups(restoreSourcePath);
		}
	}, [clearRestoreBackup, restoreSourcePath, reloadBackups]);

	const handleDelete = useCallback(
		async (archivePath: string) => {
			await deleteBackup(archivePath);
		},
		[deleteBackup],
	);

	return (
		<Box
			sx={{ minHeight: "100vh", bgcolor: "background.default", pt: 4, pb: 8 }}
		>
			<Container
				maxWidth="lg"
				sx={{
					display: "flex",
					flexDirection: "column",
					height: "calc(100vh - 32px)",
				}}
			>
				<Stack
					direction="row"
					alignItems="center"
					spacing={2}
					sx={{ mb: 3, flexShrink: 0 }}
				>
					<IconButton
						onClick={onBack}
						sx={{
							border: `1px solid ${theme.palette.divider}`,
							borderRadius: 3,
							color: "text.primary",
							"&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.1) },
						}}
					>
						<ArrowBack />
					</IconButton>
					<Box>
						<Typography
							variant="h4"
							component="h1"
							sx={{ fontWeight: 700, letterSpacing: "-0.02em" }}
						>
							{t("backups.title")}
						</Typography>
						<Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
							{t("backups.subtitle")}
						</Typography>
					</Box>
				</Stack>

				<Tabs
					value={activeTab}
					onChange={(_, value) => setActiveTab(value)}
					sx={{
						mb: 3,
						flexShrink: 0,
						borderBottom: `1px solid ${theme.palette.divider}`,
					}}
				>
					<Tab
						value="backup"
						icon={<BackupIcon fontSize="small" />}
						iconPosition="start"
						label={t("backups.tabBackup")}
						sx={{ textTransform: "none", fontWeight: 600, minHeight: 48 }}
					/>
					<Tab
						value="restore"
						icon={<SettingsBackupRestore fontSize="small" />}
						iconPosition="start"
						label={t("backups.tabRestore")}
						sx={{ textTransform: "none", fontWeight: 600, minHeight: 48 }}
					/>
				</Tabs>

				{/* --- BACKUP TAB --- */}
				{activeTab === "backup" && (
					<Box
						sx={{
							display: "flex",
							flexDirection: "column",
							flex: 1,
							minHeight: 0,
						}}
					>
						{/* Central backup action bar */}
						<Stack
							direction={{ xs: "column", sm: "row" }}
							alignItems={{ xs: "stretch", sm: "center" }}
							justifyContent="space-between"
							spacing={2}
							sx={{
								p: 2,
								mb: 2,
								borderRadius: 2,
								border: `1px solid ${theme.palette.divider}`,
								bgcolor: "background.paper",
								flexShrink: 0,
							}}
						>
							<Stack spacing={0.25}>
								<Chip
									size="small"
									label={t("backups.selectedCount", {
										count: selectedAppIds.size,
									})}
									color={selectedAppIds.size > 0 ? "primary" : "default"}
									variant={selectedAppIds.size > 0 ? "filled" : "outlined"}
									sx={{ alignSelf: "flex-start" }}
								/>
								{downloadsDir && (
									<Typography variant="caption" color="text.secondary">
										{t("backups.willSaveTo", { path: downloadsDir })}
									</Typography>
								)}
							</Stack>

							<Button
								variant="contained"
								size="large"
								startIcon={<BackupIcon />}
								disabled={selectedAppIds.size === 0 || !downloadsDir}
								onClick={handleCreateBackup}
								sx={{
									px: 3,
									borderRadius: 2,
									textTransform: "none",
									fontWeight: 700,
									whiteSpace: "nowrap",
									boxShadow: `0 4px 14px ${alpha(theme.palette.primary.main, 0.4)}`,
									background: `linear-gradient(45deg, ${theme.palette.primary.main}, ${theme.palette.info.main})`,
								}}
							>
								{t("backups.createBackup")}
							</Button>
						</Stack>

						<TextField
							size="small"
							placeholder={t("backups.searchApps")}
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							sx={{ mb: 1, flexShrink: 0 }}
							InputProps={{
								startAdornment: (
									<InputAdornment position="start">
										<SearchIcon fontSize="small" />
									</InputAdornment>
								),
							}}
						/>

						<Stack
							direction="row"
							alignItems="center"
							justifyContent="space-between"
							sx={{ mb: 1, flexShrink: 0 }}
						>
							<Typography variant="caption" color="text.secondary">
								{t("backups.installedApps")}
							</Typography>
							{filteredApps.length > 0 && (
								<Button
									size="small"
									onClick={toggleSelectAllFiltered}
									sx={{ textTransform: "none", fontSize: "0.75rem" }}
								>
									{allFilteredSelected
										? t("backups.deselectAll")
										: t("backups.selectAll")}
								</Button>
							)}
						</Stack>

						{/* Scoped scroll container: only this list scrolls, not the whole page */}
						<Box
							sx={{
								flex: 1,
								minHeight: 0,
								overflowY: "auto",
								border: `1px solid ${theme.palette.divider}`,
								borderRadius: 2,
								bgcolor: "background.paper",
							}}
						>
							{filteredApps.length === 0 ? (
								<Box sx={{ textAlign: "center", py: 6 }}>
									<Typography variant="body2" color="text.secondary">
										{t("backups.noAppsFound")}
									</Typography>
								</Box>
							) : (
								filteredApps.map((app, index) => {
									const isSelected = selectedAppIds.has(app.appId);
									const options = appOptions[app.appId];
									return (
										<Stack
											key={app.instanceId}
											direction="row"
											alignItems="center"
											spacing={1}
											onClick={() => toggleAppSelected(app.appId)}
											sx={{
												px: 1.5,
												py: 1,
												cursor: "pointer",
												borderBottom:
													index === filteredApps.length - 1
														? "none"
														: `1px solid ${theme.palette.divider}`,
												bgcolor: isSelected
													? alpha(theme.palette.primary.main, 0.08)
													: "transparent",
												"&:hover": {
													bgcolor: isSelected
														? alpha(theme.palette.primary.main, 0.12)
														: alpha(theme.palette.text.primary, 0.03),
												},
											}}
										>
											<Checkbox
												size="small"
												checked={isSelected}
												onChange={() => toggleAppSelected(app.appId)}
												onClick={(e) => e.stopPropagation()}
												sx={{ p: 0.5 }}
											/>
											<Box sx={{ minWidth: 0, flex: 1 }}>
												<Typography
													variant="body2"
													noWrap
													sx={{ fontWeight: 600, lineHeight: 1.3 }}
												>
													{app.name}
												</Typography>
												<Typography
													variant="caption"
													color="text.secondary"
													noWrap
													sx={{ display: "block" }}
												>
													{app.appId} · {app.version}
												</Typography>
											</Box>
											{/* Per-app inclusion options — only meaningful once the app is selected */}
											<Stack
												direction="row"
												spacing={0.5}
												flexShrink={0}
												onClick={(e) => e.stopPropagation()}
												sx={{ opacity: isSelected ? 1 : 0.35 }}
											>
												<Chip
													size="small"
													clickable={isSelected}
													disabled={!isSelected}
													label={t("backups.includeData")}
													color={options?.includeData ? "info" : "default"}
													variant={options?.includeData ? "filled" : "outlined"}
													onClick={() =>
														isSelected &&
														toggleAppOption(app.appId, "includeData")
													}
												/>
												<Chip
													size="small"
													clickable={isSelected}
													disabled={!isSelected}
													label={t("backups.includeRuntime")}
													color={options?.includeRuntime ? "info" : "default"}
													variant={
														options?.includeRuntime ? "filled" : "outlined"
													}
													onClick={() =>
														isSelected &&
														toggleAppOption(app.appId, "includeRuntime")
													}
												/>
											</Stack>
										</Stack>
									);
								})
							)}
						</Box>
					</Box>
				)}

				{/* --- RESTORE TAB --- */}
				{activeTab === "restore" && (
					<Box
						sx={{
							display: "flex",
							flexDirection: "column",
							flex: 1,
							minHeight: 0,
						}}
						onDragOver={(e) => {
							e.preventDefault();
							setIsDragOver(true);
						}}
						onDragLeave={() => setIsDragOver(false)}
					>
						{/* Source picker: restoring usually happens on a different machine,
						    so the backup file must be picked explicitly (dialog or drag&drop) */}
						<Stack
							direction={{ xs: "column", sm: "row" }}
							alignItems={{ xs: "stretch", sm: "center" }}
							justifyContent="space-between"
							spacing={2}
							sx={{
								p: 2,
								mb: 2,
								borderRadius: 2,
								border: `1px dashed ${
									isDragOver
										? theme.palette.primary.main
										: theme.palette.divider
								}`,
								bgcolor: isDragOver
									? alpha(theme.palette.primary.main, 0.06)
									: "background.paper",
								flexShrink: 0,
								transition: "all 0.15s",
							}}
						>
							<Box sx={{ minWidth: 0 }}>
								<Typography variant="body2" sx={{ fontWeight: 600 }}>
									{t("backups.sourceFile")}
								</Typography>
								<Typography
									variant="caption"
									color="text.secondary"
									noWrap
									sx={{ display: "block" }}
								>
									{restoreSourcePath ?? t("backups.sourceFileHint")}
								</Typography>
							</Box>
							<Button
								variant="outlined"
								startIcon={<InsertDriveFile />}
								onClick={handlePickRestoreSource}
								sx={{ textTransform: "none", whiteSpace: "nowrap" }}
							>
								{t("backups.chooseFile")}
							</Button>
						</Stack>

						<Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
							{!restoreSourcePath ? (
								<Box sx={{ textAlign: "center", py: 8 }}>
									<Typography variant="body2" color="text.secondary">
										{t("backups.sourceFileHint")}
									</Typography>
								</Box>
							) : isLoadingBackups ? (
								<Typography
									variant="body2"
									color="text.secondary"
									sx={{ py: 4 }}
								>
									{t("backups.loading")}
								</Typography>
							) : backups.length === 0 ? (
								<Box sx={{ textAlign: "center", py: 8 }}>
									<Typography variant="body2" color="text.secondary">
										{t("backups.noBackups")}
									</Typography>
								</Box>
							) : (
								<Stack spacing={1.5}>
									{backups.map((session) => (
										<Box
											key={session.archive_path}
											sx={{
												p: 2,
												borderRadius: 2,
												border: `1px solid ${theme.palette.divider}`,
												bgcolor: "background.paper",
											}}
										>
											<Stack
												direction="row"
												alignItems="flex-start"
												justifyContent="space-between"
												spacing={2}
											>
												<Box sx={{ minWidth: 0 }}>
													<Typography variant="body1" sx={{ fontWeight: 700 }}>
														{new Date(session.created_at).toLocaleString()}
													</Typography>
													<Typography variant="caption" color="text.secondary">
														{t("backups.appsCount", {
															count: session.apps.length,
														})}{" "}
														· {formatBytes(session.size_bytes)}
													</Typography>
												</Box>
												<Stack direction="row" spacing={1} flexShrink={0}>
													<Button
														size="small"
														variant="outlined"
														startIcon={<Restore />}
														onClick={() => handleRestore(session.archive_path)}
													>
														{t("backups.restore")}
													</Button>
													<IconButton
														size="small"
														color="error"
														onClick={() => handleDelete(session.archive_path)}
													>
														<Delete fontSize="small" />
													</IconButton>
												</Stack>
											</Stack>

											<Stack
												direction="row"
												flexWrap="wrap"
												gap={0.75}
												sx={{ mt: 1.5 }}
											>
												{session.apps.map((appSummary) => (
													<Chip
														key={appSummary.app_id}
														size="small"
														label={`${appSummary.name} ${appSummary.version}`}
														variant="outlined"
													/>
												))}
											</Stack>
										</Box>
									))}
								</Stack>
							)}
						</Box>
					</Box>
				)}

				{/* Create backup progress dialog */}
				<Dialog
					open={createDialogOpen}
					onClose={!isCreatingBackup ? handleCloseCreateDialog : undefined}
					maxWidth="md"
					fullWidth
				>
					<DialogContent>
						<Typography variant="h6" gutterBottom>
							{t("backups.creatingBackup")}
						</Typography>
						<Terminal output={createProgress} isRunning={isCreatingBackup} />
						{isCreatingBackup && compressProgress && (
							<Box sx={{ mt: 2 }}>
								<LinearProgress
									variant="indeterminate"
									sx={{ borderRadius: 1, height: 6 }}
								/>
								<Typography
									variant="caption"
									color="text.secondary"
									sx={{ display: "block", mt: 0.75 }}
								>
									{t("backups.compressing", {
										written: formatBytes(compressProgress.written),
										total: formatBytes(compressProgress.sourceSize),
									})}
								</Typography>
							</Box>
						)}
						{!isCreatingBackup && (
							<Box
								sx={{ display: "flex", flexDirection: "column", gap: 1, mt: 2 }}
							>
								{lastBackupPath && (
									<Typography variant="body2" color="text.secondary">
										{t("backups.savedTo", { path: lastBackupPath })}
									</Typography>
								)}
								<Box sx={{ display: "flex", justifyContent: "flex-end" }}>
									<Button variant="contained" onClick={handleCloseCreateDialog}>
										{t("myApps.closeButton")}
									</Button>
								</Box>
							</Box>
						)}
					</DialogContent>
				</Dialog>

				{/* Restore backup progress dialog */}
				<Dialog
					open={restoringArchivePath !== null}
					onClose={!isRestoringBackup ? handleCloseRestoreDialog : undefined}
					maxWidth="md"
					fullWidth
				>
					<DialogContent>
						<Typography variant="h6" gutterBottom>
							{t("backups.restoringBackup")}
						</Typography>
						<Terminal output={restoreProgress} isRunning={isRestoringBackup} />
						{!isRestoringBackup && (
							<Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
								<Button variant="contained" onClick={handleCloseRestoreDialog}>
									{t("myApps.closeButton")}
								</Button>
							</Box>
						)}
					</DialogContent>
				</Dialog>
			</Container>
		</Box>
	);
};
