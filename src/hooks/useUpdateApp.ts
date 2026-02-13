import { useCallback, useState } from "react";
import { dbCacheManager } from "../utils/dbCache";
import { updateFlatpakApp } from "../utils/flatpakOperations";

interface UseUpdateAppReturn {
	updateApp: (appId: string, appName?: string) => Promise<boolean>;
	updatingApp: string | null;
	isUpdating: boolean;
	updateOutput: string[];
	updateProgress: number;
	clearUpdate: () => void;
}

export function useUpdateApp(): UseUpdateAppReturn {
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
			const result = await updateFlatpakApp(appId, (progress) => {
				// Update output in real-time
				setUpdateOutput((prev) => [...prev, progress.output]);

				// Update progress if available
				if (progress.progress !== undefined) {
					setUpdateProgress(progress.progress);
				}
			});

			// No need to set output again, it's already been updated in real-time
			// setUpdateOutput(result.output);

			if (result.success) {
				setUpdateOutput((prev) => [
					...prev,
					"",
					"✓ Actualización completada exitosamente",
				]);
				setUpdateProgress(100);

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
	}, []);

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
