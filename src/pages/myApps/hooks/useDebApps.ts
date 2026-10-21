import { invoke } from "@tauri-apps/api/core";
import { useCallback, useState } from "react";
import type { InstalledAppInfo } from "../../../store/installedAppsStore";
import type { DebAppRust } from "../../../types/installedPackages";
import { toDebAppInfo } from "../../../utils/installedApps";

// Lazily loaded list of installed .deb packages. `load(true)` forces a refresh.
export const useDebApps = () => {
	const [debApps, setDebApps] = useState<InstalledAppInfo[] | null>(null);
	const [isLoadingDebs, setIsLoadingDebs] = useState(false);

	const loadDebApps = useCallback(
		async (force = false) => {
			if (!force && debApps !== null) return;
			setIsLoadingDebs(true);
			try {
				const response = await invoke<DebAppRust[]>("get_installed_debs");
				setDebApps(response.map(toDebAppInfo));
			} catch (error) {
				console.error("Error loading deb apps:", error);
				setDebApps([]);
			} finally {
				setIsLoadingDebs(false);
			}
		},
		[debApps],
	);

	return { debApps, isLoadingDebs, loadDebApps };
};
