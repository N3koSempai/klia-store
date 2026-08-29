import { useCallback, useState } from "react";
import { useInstalledAppsStore } from "../store/installedAppsStore";
import { dbCacheManager } from "../utils/dbCache";
import { updateFlatpakApp } from "../utils/flatpakOperations";
import { resolveGithubRepoForUpdate } from "../utils/githubReleaseApps";

interface UseUpdateAppReturn {
	updateApp: (appId: string, appName?: string) => Promise<boolean>;
	updatingApp: string | null;
	isUpdating: boolean;
	updateOutput: string[];
	updateProgress: number;
	clearUpdate: () => void;
}

export function useUpdateApp(): UseUpdateAppReturn {
	const getUpdateInfo = useInstalledAppsStore((state) => state.getUpdateInfo);
	const getInstallSource = useInstalledAppsStore(
		(state) => state.getInstallSource,
	);
	const clearAvailableUpdate = useInstalledAppsStore(
		(state) => state.clearAvailableUpdate,
	);
	const [updatingApp, setUpdatingApp] = useState<string | null>(null);
	const [isUpdating, setIsUpdating] = useState(false);
	const [updateOutput, setUpdateOutput] = useState<string[]>([]);
	const [updateProgress, setUpdateProgress] = useState(0);

	const updateApp = useCallback(async (appId: string, appName?: string) => {
		setUpdatingApp(appId);
		setIsUpdating(true);
		setUpdateOutput([`Preparando actualización de ${appName || appId}...`, ""]);
		setUpdateProgress(0);

		try {
			const githubRepo = resolveGithubRepoForUpdate(
				appId,
				getInstallSource(appId),
				getUpdateInfo(appId),
			);
			const result = await updateFlatpakApp(
				appId,
				(progress) => {
					// Update output in real-time
					setUpdateOutput((prev) => [...prev, progress.output]);

					// Update progress if available
					if (progress.progress !== undefined) {
						setUpdateProgress(progress.progress);
					}
				},
				githubRepo,
			);

			// No need to set output again, it's already been updated in real-time
			// setUpdateOutput(result.output);

			if (result.success) {
				setUpdateOutput((prev) => [
					...prev,
					"",
					"✓ Actualización completada exitosamente",
				]);
				setUpdateProgress(100);
				clearAvailableUpdate(appId);

				// Mark permissions as outdated since the app was updated
				try {
					await dbCacheManager.markPermissionsAsOutdated(appId);
				} catch (error) {
					console.error("Error marking permissions as outdated:", error);
				}
			} else {
				setUpdateOutput((prev) => [
					...prev,
					"",
					`✗ Error en la actualización (código: ${result.exitCode})`,
				]);
			}

			setIsUpdating(false);
			return result.success;
		} catch (error) {
			setUpdateOutput((prev) => [
				...prev,
				"",
				`✗ Error al ejecutar comando: ${error}`,
			]);
			setIsUpdating(false);
			return false;
		}
	}, [getUpdateInfo, getInstallSource, clearAvailableUpdate]);

	const clearUpdate = useCallback(() => {
		setUpdatingApp(null);
		setUpdateOutput([]);
		setUpdateProgress(0);
	}, []);

	return {
		updateApp,
		updatingApp,
		isUpdating,
		updateOutput,
		updateProgress,
		clearUpdate,
	};
}
