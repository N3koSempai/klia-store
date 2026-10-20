import { invoke } from "@tauri-apps/api/core";
import { useCallback } from "react";
import { useInstalledAppsStore } from "../store/installedAppsStore";
import type { InstalledPackagesResponse } from "../types/installedPackages";
import {
	toInstalledAppInfo,
	toInstalledExtensionInfo,
} from "../utils/installedApps";
import { checkAvailableUpdates } from "../utils/updateChecker";

// Reloads the installed flatpaks/extensions into the store, then refreshes
// the available updates. Shared by every flow that changes what's installed.
export const useReloadInstalledApps = () => {
	const setAvailableUpdates = useInstalledAppsStore(
		(state) => state.setAvailableUpdates,
	);
	const setInstalledAppsInfo = useInstalledAppsStore(
		(state) => state.setInstalledAppsInfo,
	);
	const setInstalledExtensions = useInstalledAppsStore(
		(state) => state.setInstalledExtensions,
	);

	return useCallback(async () => {
		try {
			const response = await invoke<InstalledPackagesResponse>(
				"get_installed_flatpaks",
			);
			setInstalledAppsInfo(response.apps.map(toInstalledAppInfo));
			setInstalledExtensions(response.extensions.map(toInstalledExtensionInfo));

			const updates = await checkAvailableUpdates();
			setAvailableUpdates(updates);
		} catch (error) {
			console.error("Error reloading installed apps:", error);
		}
	}, [setInstalledAppsInfo, setInstalledExtensions, setAvailableUpdates]);
};
