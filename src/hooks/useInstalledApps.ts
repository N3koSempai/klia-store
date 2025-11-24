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

export const useInstalledApps = () => {
	const { setInstalledAppsInfo, setAvailableUpdates } =
		useInstalledAppsStore();

	useEffect(() => {
		const loadInstalledApps = async () => {
			try {
				const apps = await invoke<InstalledAppRust[]>("get_installed_flatpaks");

				// Convert from Rust format to TypeScript format
				const installedAppsInfo: InstalledAppInfo[] = apps.map((app) => ({
					appId: app.app_id,
					name: app.name,
					version: app.version,
					summary: app.summary,
					developer: app.developer,
				}));

				setInstalledAppsInfo(installedAppsInfo);

				// After loading installed apps, check for available updates
				const updates = await checkAvailableUpdates();
				setAvailableUpdates(updates);
			} catch (error) {
				// If loading fails, don't block the app
				console.error("Error loading installed apps:", error);
			}
		};

		// Execute asynchronously without blocking
		loadInstalledApps();
	}, [setInstalledAppsInfo, setAvailableUpdates]);
};
