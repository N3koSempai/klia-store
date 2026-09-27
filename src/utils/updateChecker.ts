import { invoke } from "@tauri-apps/api/core";
import { reportNetworkFailure, reportNetworkSuccess } from "../store/connectivityStore";
import type { UpdateAvailableInfo } from "../store/installedAppsStore";
import { isNetworkError } from "./networkError";

interface UpdateAvailableRust {
	app_id: string;
	new_version: string;
	branch: string;
}

/**
 * Checks for available updates for installed Flatpak applications
 * @returns Promise with array of available updates
 */
export const checkAvailableUpdates = async (): Promise<
	UpdateAvailableInfo[]
> => {
	const startedAt = Date.now();
	try {
		const updates = await invoke<UpdateAvailableRust[]>(
			"get_available_updates",
		);

		// Convert from Rust format to TypeScript format
		const updatesInfo: UpdateAvailableInfo[] = updates.map((update) => ({
			appId: update.app_id,
			newVersion: update.new_version,
			branch: update.branch,
			source: "flathub" as const,
		}));

		reportNetworkSuccess(startedAt);
		return updatesInfo;
	} catch (error) {
		console.error("Error checking available updates:", error);
		if (isNetworkError(error)) {
			reportNetworkFailure();
		}
		return [];
	}
};
