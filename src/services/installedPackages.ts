import { invoke } from "@tauri-apps/api/core";
import { useInstalledAppsStore } from "../store/installedAppsStore";
import type { InstalledPackagesResponse } from "../types/installedPackages";
import {
	toInstalledAppInfos,
	toInstalledExtensionInfo,
} from "../utils/installedApps";
import { checkAvailableUpdates } from "../utils/updateChecker";

let inFlight: Promise<InstalledPackagesResponse> | null = null;

/**
 * Queries `flatpak list` through the backend. Concurrent callers share one
 * subprocess run instead of each spawning their own.
 */
export const fetchInstalledPackages =
	(): Promise<InstalledPackagesResponse> => {
		if (!inFlight) {
			inFlight = invoke<InstalledPackagesResponse>(
				"get_installed_flatpaks",
			).finally(() => {
				inFlight = null;
			});
		}
		return inFlight;
	};

/**
 * Re-queries the system's installed Flatpak state and reconciles it into the
 * store (apps, extensions, runtimes). Single source of truth for every flow
 * that changes what is installed. Returns the raw response, or null on failure.
 */
export const refreshInstalledPackages = async (
	options: { checkUpdates?: boolean } = {},
): Promise<InstalledPackagesResponse | null> => {
	const { checkUpdates = true } = options;
	try {
		const response = await fetchInstalledPackages();
		const store = useInstalledAppsStore.getState();
		store.setInstalledAppsInfo(toInstalledAppInfos(response.apps));
		store.setInstalledExtensions(
			response.extensions.map(toInstalledExtensionInfo),
		);
		store.setInstalledRuntimes(response.runtimes);

		if (checkUpdates) {
			store.setAvailableUpdates(await checkAvailableUpdates());
		}
		return response;
	} catch (error) {
		// Never block the app on a failed refresh.
		console.error("Error loading installed packages:", error);
		return null;
	}
};
