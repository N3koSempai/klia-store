import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import type { InstalledAppInfo } from "../store/installedAppsStore";
import { useInstalledAppsStore } from "../store/installedAppsStore";
import { checkAvailableUpdates } from "../utils/updateChecker";
import { v4 as uuidv4 } from "uuid";

interface InstalledAppRust {
  app_id: string;
  name: string;
  version: string;
  summary?: string;
  developer?: string;
  installed_size?: number;
}

interface InstalledExtensionRust {
  extension_id: string;
  name: string;
  version: string;
  parent_app_id: string;
}

interface InstalledPackagesResponse {
  apps: InstalledAppRust[];
  runtimes: string[];
  extensions: InstalledExtensionRust[];
}

export const useInstalledApps = () => {
  const {
    setInstalledAppsInfo,
    setInstalledExtensions,
    setAvailableUpdates,
    setInstalledRuntimes,
  } = useInstalledAppsStore();

  useEffect(() => {
    const loadInstalledPackages = async () => {
      try {
        const response = await invoke<InstalledPackagesResponse>(
          "get_installed_flatpaks",
        );

        // Convert apps from Rust format to TypeScript format
        // Generate unique instanceId for each app to handle duplicates
        // Permissions will be loaded on-demand when needed (e.g., in Analytics page)
        const installedAppsInfo: InstalledAppInfo[] = response.apps.map(
          (app) => ({
            instanceId: uuidv4(),
            appId: app.app_id,
            name: app.name,
            version: app.version,
            summary: app.summary,
            developer: app.developer,
            installedSize: app.installed_size,
            permissions: [], // Loaded on-demand
          }),
        );

        const installedExtensionsInfo = response.extensions.map((ext) => ({
          extensionId: ext.extension_id,
          name: ext.name,
          version: ext.version,
          parentAppId: ext.parent_app_id,
        }));

        setInstalledAppsInfo(installedAppsInfo);
        setInstalledExtensions(installedExtensionsInfo);
        setInstalledRuntimes(response.runtimes);

        // After loading installed apps, check for available updates
        const updates = await checkAvailableUpdates();
        setAvailableUpdates(updates);
      } catch (error) {
        // If loading fails, don't block the app
        console.error("Error loading installed packages:", error);
      }
    };

    // Execute asynchronously without blocking
    loadInstalledPackages();
  }, [
    setInstalledAppsInfo,
    setInstalledExtensions,
    setAvailableUpdates,
    setInstalledRuntimes,
  ]);
};
