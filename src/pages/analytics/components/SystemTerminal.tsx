import { Box, CircularProgress, Typography } from "@mui/material";
import { useEffect, useRef } from "react";
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
          <Typography
            sx={{
              color: "#8b949e",
              fontFamily: "monospace",
              fontSize: "0.875rem",
            }}
          >
            Initializing system...
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
        storage: "STORAGE SIZE",
        camera: "CAMERA",
        files: "FILES",
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
        if (!bytes) return "Unknown";
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
            <br />║ PERMISSION FILTER:{" "}
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
            [APPS WITH {permissionLabels[permissionFilter]} PERMISSION]
          </Typography>

          <Typography
            sx={{
              color: "#8b949e",
              fontFamily: "monospace",
              fontSize: "0.75rem",
              mb: 2,
            }}
          >
            Total: {appsToDisplay.length} / {totalApps} apps
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
              No apps found.
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
            [INFO] Click on an app in the 3D view for details
            <br />
            [INFO] Click the filter badge again to clear
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
    const appIdParts = selectedApp.appId.split(".");
    const domain =
      appIdParts.length >= 2
        ? `${appIdParts[0]}.${appIdParts[1]}`
        : appIdParts[0] || "unknown";

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
          ║ APPLICATION TECHNICAL DETAILS ║
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
          Version: {selectedApp.version || "unknown"}
          <br />
          Developer: {selectedApp.developer || "unknown"}
          <br />
          Type: {appType}
          <br />
          Domain: {domain}
          <br />
          Namespace: {namespace}
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
          Format: Flatpak
          <br />
          Repository: Flathub
          <br />
          Branch: stable
          <br />
          Status: <span style={{ color: "#56d364" }}>✓ INSTALLED</span>
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
          Sandboxed: Yes (Flatpak)
          <br />
          Desktop: Integrated
          <br />
          Files: ~/.local/share/flatpak/app/{selectedApp.appId}
          <br />
          Data: ~/.var/app/{selectedApp.appId}
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
