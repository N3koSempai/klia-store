import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import type { UpdateAvailableInfo } from "../store/installedAppsStore";
import { useInstalledAppsStore } from "../store/installedAppsStore";

interface UpdateAvailableRust {
	app_id: string;
	new_version: string;
	branch: string;
}

export const useAvailableUpdates = () => {
	const { setAvailableUpdates } = useInstalledAppsStore();

	useEffect(() => {
		const loadAvailableUpdates = async () => {
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

				setAvailableUpdates(updatesInfo);
			} catch (error) {
				// If loading fails, don't block the app
				console.error("Error loading available updates:", error);
			}
		};

		// Execute asynchronously without blocking
		loadAvailableUpdates();
	}, [setAvailableUpdates]);
};
