import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { Box, IconButton, Paper, Typography } from "@mui/material";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { InstalledAppInfo } from "../../store/installedAppsStore";
import { useInstalledAppsStore } from "../../store/installedAppsStore";
import { dbCacheManager } from "../../utils/dbCache";
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
  const installedAppsInfo = useInstalledAppsStore(
    (state) => state.installedAppsInfo,
  );
  const setInstalledAppsInfo = useInstalledAppsStore(
    (state) => state.setInstalledAppsInfo,
  );
  const installedRuntimes = useInstalledAppsStore(
    (state) => state.installedRuntimes,
  );
  const availableUpdates = useInstalledAppsStore(
    (state) => state.availableUpdates,
  );

  const loadAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      // Use flatpak stats from store if available to avoid redundant flatpak commands
      const extensionCount = Object.values(
        useInstalledAppsStore.getState().installedExtensions,
      ).reduce((sum, exts) => sum + exts.length, 0);
      const updateCount = Object.keys(availableUpdates).length;

      const data = await invoke<SystemAnalytics>("get_system_analytics", {
        totalApps: installedAppsInfo.length,
        totalRuntimes: installedRuntimes.size,
        totalExtensions: extensionCount,
        appsWithUpdates: updateCount,
      });
      setAnalytics(data);
    } catch (error) {
      console.error("Error loading analytics:", error);
    } finally {
      setLoading(false);
    }
  }, [installedAppsInfo.length, installedRuntimes.size, availableUpdates]);

  // Load permissions on-demand when Analytics page opens
  const loadPermissions = useCallback(async () => {
    // Check if permissions are already loaded in store
    const hasPermissions = installedAppsInfo.some(
      (app) => app.permissions && app.permissions.length > 0,
    );

    if (hasPermissions || installedAppsInfo.length === 0) {
      return; // Already loaded or no apps
    }

    try {
      // Step 1: Try to get cached permissions from SQLite
      const cachedPermissions = await dbCacheManager.getCachedPermissionsBatch(
        installedAppsInfo.map((app) => ({
          appId: app.appId,
          version: app.version,
        })),
      );

      // Step 2: Find apps that need permissions fetched
      const appsNeedingPermissions = installedAppsInfo.filter(
        (app) => !cachedPermissions[app.appId],
      );

      let freshPermissions: Record<string, string[]> = {};

      // Step 3: Fetch missing permissions from flatpak
      if (appsNeedingPermissions.length > 0) {
        const appIds = appsNeedingPermissions.map((app) => app.appId);
        freshPermissions = await invoke<Record<string, string[]>>(
          "get_app_permissions_batch",
          { appIds },
        );

        // Step 4: Cache the newly fetched permissions
        const permissionsToCache: Record<
          string,
          { version: string; permissions: string[] }
        > = {};
        for (const app of appsNeedingPermissions) {
          if (freshPermissions[app.appId]) {
            permissionsToCache[app.appId] = {
              version: app.version,
              permissions: freshPermissions[app.appId],
            };
          }
        }
        await dbCacheManager.cachePermissionsBatch(permissionsToCache);
      }

      // Step 5: Merge cached and fresh permissions
      const allPermissions = { ...cachedPermissions, ...freshPermissions };

      // Step 6: Update apps with permissions
      const updatedApps = installedAppsInfo.map((app) => ({
        ...app,
        permissions: allPermissions[app.appId] || [],
      }));
      setInstalledAppsInfo(updatedApps);

      // Step 7: Clean old versions from cache (keep only current versions)
      // This prevents database from growing indefinitely
      try {
        await dbCacheManager.cleanOldPermissionsBatch(
          installedAppsInfo.map((app) => ({
            appId: app.appId,
            version: app.version,
          })),
        );
      } catch (error) {
        console.error("Error cleaning old permissions:", error);
      }
    } catch (error) {
      console.error("Error loading permissions:", error);
    }
  }, [installedAppsInfo, setInstalledAppsInfo]);

  useEffect(() => {
    loadAnalytics();
    loadPermissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Solo ejecutar una vez al montar el componente

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
            {t("analytics.title")}
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
                  {t("analytics.totalApps")}
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
                  {t("analytics.hostname")}
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
                  {t("analytics.kernel")}
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
                  {t("analytics.diskUsage")}
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
