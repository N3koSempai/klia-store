import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import type { InstalledAppInfo } from "../store/installedAppsStore";
import { useInstalledAppsStore } from "../store/installedAppsStore";
import { checkAvailableUpdates } from "../utils/updateChecker";

interface InstalledAppRust {
	app_id: string;
	name: string;
	version: string;
	summary?: string;
	developer?: string;
}

interface InstalledPackagesResponse {
	apps: InstalledAppRust[];
	runtimes: string[];
}

export const useInstalledApps = () => {
	const { setInstalledAppsInfo, setAvailableUpdates, setInstalledRuntimes } =
		useInstalledAppsStore();

	useEffect(() => {
		const loadInstalledPackages = async () => {
			try {
				const response = await invoke<InstalledPackagesResponse>(
					"get_installed_flatpaks",
				);

				// Convert apps from Rust format to TypeScript format
				const installedAppsInfo: InstalledAppInfo[] = response.apps.map(
					(app) => ({
						appId: app.app_id,
						name: app.name,
						version: app.version,
						summary: app.summary,
						developer: app.developer,
					}),
				);

				setInstalledAppsInfo(installedAppsInfo);
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
	}, [setInstalledAppsInfo, setAvailableUpdates, setInstalledRuntimes]);
};
