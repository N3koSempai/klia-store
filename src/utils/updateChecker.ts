import { invoke } from "@tauri-apps/api/core";
import type { UpdateAvailableInfo } from "../store/installedAppsStore";

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

		return updatesInfo;
	} catch (error) {
		console.error("Error checking available updates:", error);
		return [];
	}
};
