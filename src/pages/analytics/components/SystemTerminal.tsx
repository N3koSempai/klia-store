import { Box, CircularProgress, Typography } from "@mui/material";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { InstalledAppInfo } from "../../../store/installedAppsStore";

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

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = 0;
    }
  }, [selectedApp, permissionFilter]);

  const renderTerminalContent = () => {
    if (loading) {
      return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 2 }}>
          <CircularProgress size={16} sx={{ color: "#58a6ff" }} />
          <Typography
            sx={{
              color: "#8b949e",
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
        if (permissionFilter !== "storage") return "#ffd700";
        const bytes = size || 0;
        if (bytes > 1_000_000_000) return "#f85149"; // Rojo para > 1GB
        if (bytes > 200_000_000) return "#ffa657"; // Amarillo para 200MB-1GB
        return "#3fb950"; // Verde para < 200MB
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
              color: "#58a6ff",
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
              color: "#ffa657",
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
              color: "#8b949e",
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
                color: "#8b949e",
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
                      color: "#c9d1d9",
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
                      <span style={{ color: "#56d364" }}>{app.name}</span>
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
                      <span style={{ color: "#8b949e", paddingLeft: "24px" }}>
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
              color: "#8b949e",
              fontFamily: "monospace",
              fontSize: "0.75rem",
              mt: 3,
              pt: 2,
              borderTop: "1px solid #30363d",
            }}
          >
            {t("analytics.terminal.clickForDetails")}
            <br />
            {t("analytics.terminal.clickToClear")}
            <br />
            <br />
            <span style={{ color: "#58a6ff" }}>▊</span>
          </Typography>
        </Box>
      );
    }

    if (!selectedApp) {
      return (
        <Box sx={{ p: 2 }}>
          <Typography
            sx={{
              color: "#8b949e",
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
            <span style={{ color: "#58a6ff" }}>▊</span>
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
            color: "#58a6ff",
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
          <span style={{ color: "#8b949e" }}>
            {t("analytics.terminal.id")}:
          </span>{" "}
          {selectedApp.appId}
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
          {t("analytics.terminal.metadata")}
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
                color: "#ffa657",
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
          {t("analytics.terminal.packageInfo")}
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
          {t("analytics.terminal.format")}: {t("analytics.terminal.flatpak")}
          <br />
          {t("analytics.terminal.repository")}:{" "}
          {t("analytics.terminal.flathub")}
          <br />
          {t("analytics.terminal.branch")}: {t("analytics.terminal.stable")}
          <br />
          {t("analytics.terminal.status")}:{" "}
          <span style={{ color: "#56d364" }}>
            {t("analytics.terminal.installed")}
          </span>
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
          {t("analytics.terminal.systemIntegration")}
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
            color: "#ffa657",
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
            color: "#79c0ff",
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
            color: "#8b949e",
            fontFamily: "monospace",
            fontSize: "0.75rem",
            mt: 3,
            pt: 2,
            borderTop: "1px solid #30363d",
          }}
        >
          {t("analytics.terminal.timestamp")} {new Date().toISOString()}
          <br />
          {t("analytics.terminal.statusRetrieved")}
          <br />
          {t("analytics.terminal.source")}
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
