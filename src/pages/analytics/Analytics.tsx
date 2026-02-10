import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { Box, IconButton, Paper, Typography } from "@mui/material";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { InstalledAppInfo } from "../../store/installedAppsStore";
import { useInstalledAppsStore } from "../../store/installedAppsStore";
import { DataCube } from "./components/DataCube";
import { SystemTerminal } from "./components/SystemTerminal";

interface AnalyticsProps {
	onBack: () => void;
}

interface SystemAnalytics {
	disk_usage: {
		total_gb: number;
		used_gb: number;
		available_gb: number;
		usage_percent: number;
	};
	system_info: {
		os_name: string;
		kernel_version: string;
		hostname: string;
	};
}

export const Analytics = ({ onBack }: AnalyticsProps) => {
	const { t } = useTranslation();
	const [analytics, setAnalytics] = useState<SystemAnalytics | null>(null);
	const [loading, setLoading] = useState(true);
	const [selectedApp, setSelectedApp] = useState<InstalledAppInfo | null>(null);
	const [permissionFilter, setPermissionFilter] = useState<string | null>(null);

	// Get installed apps from store
	const allApps = useInstalledAppsStore((state) => state.installedAppsInfo);

	// Remove duplicates and add permissions using useMemo to avoid infinite loops
	const [installedAppsInfo, setInstalledAppsInfo] = useState<InstalledAppInfo[]>([]);

	useEffect(() => {
		const uniqueApps = allApps.filter((app, index, self) =>
			index === self.findIndex((a) => a.appId === app.appId)
		);
		setInstalledAppsInfo(uniqueApps);

		// Load permissions for all apps
		if (uniqueApps.length > 0) {
			loadPermissions(uniqueApps);
		}
	}, [allApps]);

	useEffect(() => {
		loadAnalytics();
	}, []);

	const loadPermissions = async (apps: InstalledAppInfo[]) => {
		try {
			const appIds = apps.map(app => app.appId);
			const permissions = await invoke<Record<string, string[]>>("get_app_permissions_batch", { appIds });

			console.log("[DEBUG] Permissions loaded:", permissions);

			// Update apps with permissions
			setInstalledAppsInfo(prevApps =>
				prevApps.map(app => ({
					...app,
					permissions: permissions[app.appId] || []
				}))
			);
		} catch (error) {
			console.error("Error loading permissions:", error);
		}
	};

	const loadAnalytics = async () => {
		try {
			setLoading(true);
			const data = await invoke<SystemAnalytics>("get_system_analytics");
			setAnalytics(data);
		} catch (error) {
			console.error("Error loading analytics:", error);
		} finally {
			setLoading(false);
		}
	};

	return (
		<Box
			sx={{
				height: "100%",
				width: "100%",
				bgcolor: "#0d1117",
				color: "#c9d1d9",
				fontFamily: '"JetBrains Mono", "Fira Code", monospace',
				overflow: "hidden",
				display: "flex",
				flexDirection: "column",
				position: "relative",
			}}
		>
			{/* Top Panel */}
			<Paper
				sx={{
					bgcolor: "#161b22",
					border: "1px solid #30363d",
					borderRadius: 0,
					p: 2,
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
				}}
			>
				<Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
					<IconButton onClick={onBack} sx={{ color: "#58a6ff" }}>
						<ArrowBackIcon />
					</IconButton>
					<Typography
						variant="h5"
						sx={{
							fontFamily: '"JetBrains Mono", monospace',
							fontWeight: 700,
							color: "#58a6ff",
						}}
					>
						SYSTEM ANALYTICS
					</Typography>
				</Box>

				<Box sx={{ display: "flex", gap: 4 }}>
					{analytics && (
						<>
							<Box>
								<Typography
									variant="caption"
									sx={{ color: "#8b949e", textTransform: "uppercase" }}
								>
									Total Apps
								</Typography>
								<Typography
									variant="body2"
									sx={{ fontFamily: "monospace", color: "#58a6ff" }}
								>
									{installedAppsInfo.length}
								</Typography>
							</Box>
							<Box>
								<Typography
									variant="caption"
									sx={{ color: "#8b949e", textTransform: "uppercase" }}
								>
									Hostname
								</Typography>
								<Typography
									variant="body2"
									sx={{ fontFamily: "monospace", color: "#58a6ff" }}
								>
									{analytics.system_info.hostname}
								</Typography>
							</Box>
							<Box>
								<Typography
									variant="caption"
									sx={{ color: "#8b949e", textTransform: "uppercase" }}
								>
									Kernel
								</Typography>
								<Typography
									variant="body2"
									sx={{ fontFamily: "monospace", color: "#58a6ff" }}
								>
									{analytics.system_info.kernel_version}
								</Typography>
							</Box>
							<Box>
								<Typography
									variant="caption"
									sx={{ color: "#8b949e", textTransform: "uppercase" }}
								>
									Disk Usage
								</Typography>
								<Typography
									variant="body2"
									sx={{ fontFamily: "monospace", color: "#58a6ff" }}
								>
									{analytics.disk_usage.usage_percent.toFixed(1)}%
								</Typography>
							</Box>
						</>
					)}
				</Box>
			</Paper>

			{/* Bottom Panels */}
			<Box
				sx={{
					display: "flex",
					flex: 1,
					borderTop: "1px solid #30363d",
					overflow: "hidden",
				}}
			>
				{/* Left Panel - 3D Cube (70%) */}
				<Box
					sx={{
						width: "70%",
						borderRight: "1px solid #30363d",
						bgcolor: "#0d1117",
						position: "relative",
						overflow: "hidden",
					}}
				>
					<DataCube
						installedApps={installedAppsInfo}
						loading={loading}
						onAppSelect={setSelectedApp}
						onPermissionFilterChange={setPermissionFilter}
						selectedApp={selectedApp}
					/>
				</Box>

				{/* Right Panel - Terminal (30%) */}
				<Box sx={{ width: "30%", bgcolor: "#161b22", overflow: "hidden" }}>
					<SystemTerminal
						selectedApp={selectedApp}
						totalApps={installedAppsInfo.length}
						loading={loading}
						permissionFilter={permissionFilter}
						installedApps={installedAppsInfo}
						onAppSelect={setSelectedApp}
					/>
				</Box>
			</Box>
		</Box>
	);
};
