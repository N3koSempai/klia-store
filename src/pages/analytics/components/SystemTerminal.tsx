import { Box, CircularProgress, Typography } from "@mui/material";
import { useEffect, useRef } from "react";
import type { InstalledAppInfo } from "../../../store/installedAppsStore";

interface SystemTerminalProps {
	selectedApp: InstalledAppInfo | null;
	totalApps: number;
	loading: boolean;
}

export const SystemTerminal = ({
	selectedApp,
	totalApps,
	loading,
}: SystemTerminalProps) => {
	const terminalRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (terminalRef.current) {
			terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
		}
	}, [selectedApp]);

	const renderTerminalContent = () => {
		if (loading) {
			return (
				<Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 2 }}>
					<CircularProgress size={16} sx={{ color: "#58a6ff" }} />
					<Typography sx={{ color: "#8b949e", fontFamily: "monospace", fontSize: "0.875rem" }}>
						Initializing system...
					</Typography>
				</Box>
			);
		}

		if (!selectedApp) {
			return (
				<Box sx={{ p: 2 }}>
					<Typography sx={{ color: "#8b949e", fontFamily: "monospace", fontSize: "0.875rem" }}>
						$ klia-analytics-terminal v2.0.0
						<br />
						$ system ready
						<br />
						<br />
						[INFO] Total applications installed: {totalApps}
						<br />
						[INFO] Data cube visualization active
						<br />
						[INFO] Awaiting app selection...
						<br />
						<br />
						<span style={{ color: "#58a6ff" }}>▊</span>
					</Typography>
				</Box>
			);
		}

		// Extract domain from app ID (e.g., "io.github" from "io.github.user.app")
		const appIdParts = selectedApp.appId.split('.');
		const domain = appIdParts.length >= 2 ? `${appIdParts[0]}.${appIdParts[1]}` : appIdParts[0] || "unknown";

		// Get namespace (e.g., "user" from "io.github.user.app")
		const namespace = appIdParts.length >= 3 ? appIdParts[2] : "unknown";

		// Determine app type based on domain
		let appType = "Application";
		if (selectedApp.appId.includes(".BaseApp")) {
			appType = "Base Application";
		} else if (selectedApp.appId.includes(".Sdk")) {
			appType = "SDK";
		} else if (selectedApp.appId.includes(".Platform")) {
			appType = "Platform";
		}

		return (
			<Box sx={{ p: 2 }}>
				<Typography
					sx={{
						color: "#58a6ff",
						fontFamily: "monospace",
						fontSize: "0.875rem",
						fontWeight: 700,
						mb: 2,
					}}
				>
					╔════════════════════════════════════════╗
					<br />
					║ APPLICATION TECHNICAL DETAILS          ║
					<br />
					╚════════════════════════════════════════╝
				</Typography>

				{/* App Name */}
				<Typography
					sx={{
						color: "#56d364",
						fontFamily: "monospace",
						fontSize: "0.875rem",
						fontWeight: 700,
						mb: 1,
					}}
				>
					{selectedApp.name}
				</Typography>

				{/* App ID */}
				<Typography
					sx={{
						color: "#c9d1d9",
						fontFamily: "monospace",
						fontSize: "0.75rem",
						lineHeight: 1.8,
						mb: 2,
					}}
				>
					<span style={{ color: "#8b949e" }}>ID:</span> {selectedApp.appId}
				</Typography>

				{/* Metadata Section */}
				<Typography
					sx={{
						color: "#ffa657",
						fontFamily: "monospace",
						fontSize: "0.75rem",
						fontWeight: 700,
						mb: 1,
					}}
				>
					[METADATA]
				</Typography>

				<Typography
					sx={{
						color: "#c9d1d9",
						fontFamily: "monospace",
						fontSize: "0.75rem",
						lineHeight: 1.8,
						mb: 2,
					}}
				>
					Version:    {selectedApp.version || "unknown"}
					<br />
					Developer:  {selectedApp.developer || "unknown"}
					<br />
					Type:       {appType}
					<br />
					Domain:     {domain}
					<br />
					Namespace:  {namespace}
				</Typography>

				{/* Summary Section */}
				{selectedApp.summary && (
					<>
						<Typography
							sx={{
								color: "#ffa657",
								fontFamily: "monospace",
								fontSize: "0.75rem",
								fontWeight: 700,
								mb: 1,
							}}
						>
							[DESCRIPTION]
						</Typography>
						<Typography
							sx={{
								color: "#c9d1d9",
								fontFamily: "monospace",
								fontSize: "0.75rem",
								lineHeight: 1.8,
								mb: 2,
							}}
						>
							{selectedApp.summary}
						</Typography>
					</>
				)}

				{/* Package Information */}
				<Typography
					sx={{
						color: "#ffa657",
						fontFamily: "monospace",
						fontSize: "0.75rem",
						fontWeight: 700,
						mb: 1,
					}}
				>
					[PACKAGE INFO]
				</Typography>

				<Typography
					sx={{
						color: "#c9d1d9",
						fontFamily: "monospace",
						fontSize: "0.75rem",
						lineHeight: 1.8,
						mb: 2,
					}}
				>
					Format:     Flatpak
					<br />
					Repository: Flathub
					<br />
					Branch:     stable
					<br />
					Status:     {" "}
					<span style={{ color: "#56d364" }}>✓ INSTALLED</span>
				</Typography>

				{/* System Integration */}
				<Typography
					sx={{
						color: "#ffa657",
						fontFamily: "monospace",
						fontSize: "0.75rem",
						fontWeight: 700,
						mb: 1,
					}}
				>
					[SYSTEM INTEGRATION]
				</Typography>

				<Typography
					sx={{
						color: "#c9d1d9",
						fontFamily: "monospace",
						fontSize: "0.75rem",
						lineHeight: 1.8,
						mb: 2,
					}}
				>
					Sandboxed:  Yes (Flatpak)
					<br />
					Desktop:    Integrated
					<br />
					Files:      ~/.local/share/flatpak/app/{selectedApp.appId}
					<br />
					Data:       ~/.var/app/{selectedApp.appId}
				</Typography>

				{/* Commands */}
				<Typography
					sx={{
						color: "#ffa657",
						fontFamily: "monospace",
						fontSize: "0.75rem",
						fontWeight: 700,
						mb: 1,
					}}
				>
					[AVAILABLE COMMANDS]
				</Typography>

				<Typography
					sx={{
						color: "#79c0ff",
						fontFamily: "monospace",
						fontSize: "0.75rem",
						lineHeight: 1.8,
						mb: 2,
					}}
				>
					$ flatpak run {selectedApp.appId}
					<br />
					$ flatpak info {selectedApp.appId}
					<br />
					$ flatpak update {selectedApp.appId}
					<br />
					$ flatpak uninstall {selectedApp.appId}
				</Typography>

				{/* Footer */}
				<Typography
					sx={{
						color: "#8b949e",
						fontFamily: "monospace",
						fontSize: "0.75rem",
						mt: 3,
						pt: 2,
						borderTop: "1px solid #30363d",
					}}
				>
					[TIMESTAMP] {new Date().toISOString()}
					<br />
					[STATUS] Data retrieved successfully
					<br />
					[SOURCE] Flatpak system database
					<br />
					<br />
					<span style={{ color: "#58a6ff" }}>▊</span>
				</Typography>
			</Box>
		);
	};

	return (
		<Box
			sx={{
				height: "100%",
				display: "flex",
				flexDirection: "column",
				bgcolor: "#161b22",
			}}
		>
			{/* Terminal Header */}
			<Box
				sx={{
					p: 1.5,
					bgcolor: "#0d1117",
					border: "1px solid #30363d",
					borderLeft: "none",
					display: "flex",
					alignItems: "center",
					gap: 1,
				}}
			>
				<Box
					sx={{
						width: 10,
						height: 10,
						borderRadius: "50%",
						bgcolor: "#f85149",
					}}
				/>
				<Box
					sx={{
						width: 10,
						height: 10,
						borderRadius: "50%",
						bgcolor: "#ffa657",
					}}
				/>
				<Box
					sx={{
						width: 10,
						height: 10,
						borderRadius: "50%",
						bgcolor: "#3fb950",
					}}
				/>
				<Typography
					variant="caption"
					sx={{
						ml: 2,
						color: "#8b949e",
						fontFamily: "monospace",
						textTransform: "uppercase",
					}}
				>
					{selectedApp ? `app://${selectedApp.appId}` : "system://terminal"}
				</Typography>
			</Box>

			{/* Terminal Content */}
			<Box
				ref={terminalRef}
				sx={{
					flex: 1,
					overflow: "auto",
					bgcolor: "#0d1117",
					"&::-webkit-scrollbar": {
						width: "8px",
					},
					"&::-webkit-scrollbar-track": {
						bgcolor: "#0d1117",
					},
					"&::-webkit-scrollbar-thumb": {
						bgcolor: "#30363d",
						borderRadius: "4px",
						"&:hover": {
							bgcolor: "#484f58",
						},
					},
				}}
			>
				{renderTerminalContent()}
			</Box>
		</Box>
	);
};
