import { Box, CircularProgress, Typography } from "@mui/material";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { InstalledAppInfo } from "../../../store/installedAppsStore";
import { hues, neutral, status } from "../../../theme/tokens";

interface SystemTerminalProps {
	selectedApp: InstalledAppInfo | null;
	totalApps: number;
	loading: boolean;
	permissionFilter: string | null;
	installedApps: InstalledAppInfo[];
	onAppSelect: (app: InstalledAppInfo | null) => void;
}

export const SystemTerminal = ({
	selectedApp,
	totalApps,
	loading,
	permissionFilter,
	installedApps,
	onAppSelect,
}: SystemTerminalProps) => {
	const { t } = useTranslation();
	const terminalRef = useRef<HTMLDivElement>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: terminalRef is a stable ref object
	useEffect(() => {
		if (terminalRef.current) {
			terminalRef.current.scrollTop = 0;
		}
	}, [selectedApp, permissionFilter]);

	const renderTerminalContent = () => {
		if (loading) {
			return (
				<Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 2 }}>
					<CircularProgress size={16} sx={{ color: status.info }} />
					<Typography
						sx={{
							color: neutral[600],
							fontFamily: "monospace",
							fontSize: "0.875rem",
						}}
					>
						{t("analytics.terminal.initializing")}
					</Typography>
				</Box>
			);
		}

		// Si hay filtro activo y no hay app seleccionada, mostrar listado de apps con ese permiso
		if (!selectedApp && permissionFilter) {
			let appsToDisplay: typeof installedApps = [];

			if (permissionFilter === "storage") {
				// Para storage, ordenar por tamaño (de mayor a menor)
				appsToDisplay = [...installedApps].sort((a, b) => {
					const sizeA = a.installedSize || 0;
					const sizeB = b.installedSize || 0;
					return sizeB - sizeA;
				});
			} else {
				// Para otros filtros, mostrar solo apps con ese permiso
				appsToDisplay = installedApps.filter((app) =>
					app.permissions?.includes(permissionFilter),
				);
			}

			const permissionLabels: Record<string, string> = {
				storage: t("analytics.terminal.storage"),
				camera: t("analytics.terminal.camera"),
				files: t("analytics.terminal.files"),
			};

			// Función para obtener el color según el tamaño (solo para storage)
			const getSizeColor = (size: number | undefined): string => {
				if (permissionFilter !== "storage") return hues.gold;
				const bytes = size || 0;
				if (bytes > 1_000_000_000) return status.danger; // Rojo para > 1GB
				if (bytes > 200_000_000) return hues.orange; // Amarillo para 200MB-1GB
				return status.success; // Verde para < 200MB
			};

			// Función para formatear tamaño en bytes a string legible
			const formatSize = (bytes: number | undefined): string => {
				if (!bytes) return t("common.unknown");
				if (bytes >= 1_000_000_000)
					return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
				if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(2)} MB`;
				if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(2)} kB`;
				return `${bytes} B`;
			};

			return (
				<Box sx={{ p: 2 }}>
					<Typography
						sx={{
							color: status.info,
							fontFamily: "monospace",
							fontSize: "0.875rem",
							fontWeight: 700,
							mb: 2,
						}}
					>
						╔════════════════════════════════════════╗
						<br />║ {t("analytics.terminal.permissionFilter")}:{" "}
						{permissionLabels[permissionFilter] ||
							permissionFilter.toUpperCase()}
						<br />
						╚════════════════════════════════════════╝
					</Typography>

					<Typography
						sx={{
							color: hues.orange,
							fontFamily: "monospace",
							fontSize: "0.75rem",
							fontWeight: 700,
							mb: 1,
						}}
					>
						{t("analytics.terminal.appsWithPermission", {
							permission: permissionLabels[permissionFilter],
						})}
					</Typography>

					<Typography
						sx={{
							color: neutral[600],
							fontFamily: "monospace",
							fontSize: "0.75rem",
							mb: 2,
						}}
					>
						{t("analytics.terminal.totalApps", {
							filtered: appsToDisplay.length,
							total: totalApps,
						})}
					</Typography>

					{appsToDisplay.length === 0 ? (
						<Typography
							sx={{
								color: neutral[600],
								fontFamily: "monospace",
								fontSize: "0.75rem",
								fontStyle: "italic",
							}}
						>
							{t("analytics.terminal.noAppsFound")}
						</Typography>
					) : (
						<Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
							{appsToDisplay.map((app, index) => {
								const sizeColor = getSizeColor(app.installedSize);
								return (
									<Box
										key={app.instanceId}
										onClick={() => onAppSelect(app)}
										sx={{
											color: neutral[800],
											fontFamily: "monospace",
											fontSize: "0.75rem",
											lineHeight: 1.8,
											pl: 1,
											borderLeft: `2px solid ${sizeColor}`,
											cursor: "pointer",
											transition: "all 0.2s",
											"&:hover": {
												bgcolor: `${sizeColor}20`,
												borderLeftColor: sizeColor,
												transform: "translateX(4px)",
											},
										}}
									>
										<Typography
											component="span"
											sx={{
												fontFamily: "monospace",
												fontSize: "0.75rem",
												lineHeight: 1.8,
											}}
										>
											<span style={{ color: sizeColor }}>
												{(index + 1).toString().padStart(2, "0")}.
											</span>{" "}
											<span style={{ color: hues.greenSoft }}>{app.name}</span>
											{permissionFilter === "storage" && (
												<>
													<br />
													<span
														style={{
															color: sizeColor,
															paddingLeft: "24px",
															fontWeight: "bold",
														}}
													>
														{formatSize(app.installedSize)}
													</span>
												</>
											)}
											<br />
											<span
												style={{ color: neutral[600], paddingLeft: "24px" }}
											>
												{app.appId}
											</span>
										</Typography>
									</Box>
								);
							})}
						</Box>
					)}

					<Typography
						sx={{
							color: neutral[600],
							fontFamily: "monospace",
							fontSize: "0.75rem",
							mt: 3,
							pt: 2,
							borderTop: `1px solid ${neutral[300]}`,
						}}
					>
						{t("analytics.terminal.clickForDetails")}
						<br />
						{t("analytics.terminal.clickToClear")}
						<br />
						<br />
						<span style={{ color: status.info }}>▊</span>
					</Typography>
				</Box>
			);
		}

		if (!selectedApp) {
			return (
				<Box sx={{ p: 2 }}>
					<Typography
						sx={{
							color: neutral[600],
							fontFamily: "monospace",
							fontSize: "0.875rem",
						}}
					>
						$ klia-analytics-terminal v2.0.0
						<br />
						{t("analytics.terminal.systemReady")}
						<br />
						<br />
						{t("analytics.terminal.totalInstalled", { count: totalApps })}
						<br />
						{t("analytics.terminal.visualizationActive")}
						<br />
						{t("analytics.terminal.awaitingSelection")}
						<br />
						<br />
						<span style={{ color: status.info }}>▊</span>
					</Typography>
				</Box>
			);
		}

		// Extract domain from app ID (e.g., "io.github" from "io.github.user.app")
		const appIdParts = selectedApp.appId.split(".");
		const domain =
			appIdParts.length >= 2
				? `${appIdParts[0]}.${appIdParts[1]}`
				: appIdParts[0] || "unknown";

		// Get namespace (e.g., "user" from "io.github.user.app")
		const namespace = appIdParts.length >= 3 ? appIdParts[2] : "unknown";

		// Determine app type based on domain
		let appType = t("analytics.terminal.application");
		if (selectedApp.appId.includes(".BaseApp")) {
			appType = t("analytics.terminal.baseApplication");
		} else if (selectedApp.appId.includes(".Sdk")) {
			appType = t("analytics.terminal.sdk");
		} else if (selectedApp.appId.includes(".Platform")) {
			appType = t("analytics.terminal.platform");
		}

		return (
			<Box sx={{ p: 2 }}>
				<Typography
					sx={{
						color: status.info,
						fontFamily: "monospace",
						fontSize: "0.875rem",
						fontWeight: 700,
						mb: 2,
					}}
				>
					╔════════════════════════════════════════╗
					<br />║ {t("analytics.terminal.technicalDetails")} ║
					<br />
					╚════════════════════════════════════════╝
				</Typography>

				{/* App Name */}
				<Typography
					sx={{
						color: hues.greenSoft,
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
						color: neutral[800],
						fontFamily: "monospace",
						fontSize: "0.75rem",
						lineHeight: 1.8,
						mb: 2,
					}}
				>
					<span style={{ color: neutral[600] }}>
						{t("analytics.terminal.id")}:
					</span>{" "}
					{selectedApp.appId}
				</Typography>

				{/* Metadata Section */}
				<Typography
					sx={{
						color: hues.orange,
						fontFamily: "monospace",
						fontSize: "0.75rem",
						fontWeight: 700,
						mb: 1,
					}}
				>
					{t("analytics.terminal.metadata")}
				</Typography>

				<Typography
					sx={{
						color: neutral[800],
						fontFamily: "monospace",
						fontSize: "0.75rem",
						lineHeight: 1.8,
						mb: 2,
					}}
				>
					{t("analytics.terminal.version")}:{" "}
					{selectedApp.version || t("analytics.terminal.unknown")}
					<br />
					{t("analytics.terminal.developer")}:{" "}
					{selectedApp.developer || t("analytics.terminal.unknown")}
					<br />
					{t("analytics.terminal.type")}: {appType}
					<br />
					{t("analytics.terminal.domain")}: {domain}
					<br />
					{t("analytics.terminal.namespace")}: {namespace}
				</Typography>

				{/* Summary Section */}
				{selectedApp.summary && (
					<>
						<Typography
							sx={{
								color: hues.orange,
								fontFamily: "monospace",
								fontSize: "0.75rem",
								fontWeight: 700,
								mb: 1,
							}}
						>
							{t("analytics.terminal.description")}
						</Typography>
						<Typography
							sx={{
								color: neutral[800],
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
						color: hues.orange,
						fontFamily: "monospace",
						fontSize: "0.75rem",
						fontWeight: 700,
						mb: 1,
					}}
				>
					{t("analytics.terminal.packageInfo")}
				</Typography>

				<Typography
					sx={{
						color: neutral[800],
						fontFamily: "monospace",
						fontSize: "0.75rem",
						lineHeight: 1.8,
						mb: 2,
					}}
				>
					{t("analytics.terminal.format")}: {t("analytics.terminal.flatpak")}
					<br />
					{t("analytics.terminal.repository")}:{" "}
					{t("analytics.terminal.flathub")}
					<br />
					{t("analytics.terminal.branch")}: {t("analytics.terminal.stable")}
					<br />
					{t("analytics.terminal.status")}:{" "}
					<span style={{ color: hues.greenSoft }}>
						{t("analytics.terminal.installed")}
					</span>
				</Typography>

				{/* System Integration */}
				<Typography
					sx={{
						color: hues.orange,
						fontFamily: "monospace",
						fontSize: "0.75rem",
						fontWeight: 700,
						mb: 1,
					}}
				>
					{t("analytics.terminal.systemIntegration")}
				</Typography>

				<Typography
					sx={{
						color: neutral[800],
						fontFamily: "monospace",
						fontSize: "0.75rem",
						lineHeight: 1.8,
						mb: 2,
					}}
				>
					{t("analytics.terminal.sandboxed")}: {t("analytics.terminal.yes")} (
					{t("analytics.terminal.flatpak")})
					<br />
					{t("analytics.terminal.desktop")}:{" "}
					{t("analytics.terminal.integrated")}
					<br />
					{t("analytics.terminal.files")}: ~/.local/share/flatpak/app/
					{selectedApp.appId}
					<br />
					{t("analytics.terminal.data")}: ~/.var/app/{selectedApp.appId}
				</Typography>

				{/* Commands */}
				<Typography
					sx={{
						color: hues.orange,
						fontFamily: "monospace",
						fontSize: "0.75rem",
						fontWeight: 700,
						mb: 1,
					}}
				>
					{t("analytics.terminal.availableCommands")}
				</Typography>

				<Typography
					sx={{
						color: hues.blueLight,
						fontFamily: "monospace",
						fontSize: "0.75rem",
						lineHeight: 1.8,
						mb: 2,
					}}
				>
					$ flatpak run {selectedApp.appId}
					<br />$ flatpak info {selectedApp.appId}
					<br />$ flatpak update {selectedApp.appId}
					<br />$ flatpak uninstall {selectedApp.appId}
				</Typography>

				{/* Footer */}
				<Typography
					sx={{
						color: neutral[600],
						fontFamily: "monospace",
						fontSize: "0.75rem",
						mt: 3,
						pt: 2,
						borderTop: `1px solid ${neutral[300]}`,
					}}
				>
					{t("analytics.terminal.timestamp")} {new Date().toISOString()}
					<br />
					{t("analytics.terminal.statusRetrieved")}
					<br />
					{t("analytics.terminal.source")}
					<br />
					<br />
					<span style={{ color: status.info }}>▊</span>
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
				bgcolor: neutral[100],
			}}
		>
			{/* Terminal Header */}
			<Box
				sx={{
					p: 1.5,
					bgcolor: neutral[50],
					border: `1px solid ${neutral[300]}`,
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
						bgcolor: status.danger,
					}}
				/>
				<Box
					sx={{
						width: 10,
						height: 10,
						borderRadius: "50%",
						bgcolor: hues.orange,
					}}
				/>
				<Box
					sx={{
						width: 10,
						height: 10,
						borderRadius: "50%",
						bgcolor: status.success,
					}}
				/>
				<Typography
					variant="caption"
					sx={{
						ml: 2,
						color: neutral[600],
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
					bgcolor: neutral[50],
					"&::-webkit-scrollbar": {
						width: "8px",
					},
					"&::-webkit-scrollbar-track": {
						bgcolor: neutral[50],
					},
					"&::-webkit-scrollbar-thumb": {
						bgcolor: neutral[300],
						borderRadius: "4px",
						"&:hover": {
							bgcolor: neutral[400],
						},
					},
				}}
			>
				{renderTerminalContent()}
			</Box>
		</Box>
	);
};
