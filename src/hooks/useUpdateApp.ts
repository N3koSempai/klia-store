import { useCallback, useState } from "react";
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
				// Update progress if available
				if (progress.progress !== undefined) {
					setUpdateProgress(progress.progress);
				}
			});

			// Set final output from the operation
			setUpdateOutput(result.output);

			if (result.success) {
				setUpdateOutput((prev) => [
					...prev,
					"",
					"✓ Actualización completada exitosamente",
				]);
				setUpdateProgress(100);
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
