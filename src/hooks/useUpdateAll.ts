import { useCallback, useState } from "react";
import type { InstalledAppInfo } from "../store/installedAppsStore";
import { dbCacheManager } from "../utils/dbCache";
import {
	updateFlatpakApp,
	updateSystemFlatpaks,
} from "../utils/flatpakOperations";
import { checkAvailableUpdates } from "../utils/updateChecker";

interface UpdateAllProgress {
	totalApps: number;
	currentAppIndex: number;
	currentAppName: string;
	currentAppProgress: number;
}

interface UseUpdateAllReturn {
	updateAll: (
		appsToUpdate: InstalledAppInfo[],
		systemUpdatesCount: number,
	) => Promise<void>;
	isUpdatingAll: boolean;
	updateAllProgress: UpdateAllProgress;
	updateAllOutput: string[];
	systemUpdatesCount: number;
	isUpdatingSystem: boolean;
	systemUpdateProgress: number;
	clearUpdateAll: () => void;
}

export function useUpdateAll(onComplete?: () => void): UseUpdateAllReturn {
	const [isUpdatingAll, setIsUpdatingAll] = useState(false);
	const [updateAllProgress, setUpdateAllProgress] = useState<UpdateAllProgress>(
		{
			totalApps: 0,
			currentAppIndex: 0,
			currentAppName: "",
			currentAppProgress: 0,
		},
	);
	const [updateAllOutput, setUpdateAllOutput] = useState<string[]>([]);
	const [systemUpdatesCount, setSystemUpdatesCount] = useState(0);
	const [isUpdatingSystem, setIsUpdatingSystem] = useState(false);
	const [systemUpdateProgress, setSystemUpdateProgress] = useState(0);

	const updateAll = useCallback(
		async (appsToUpdate: InstalledAppInfo[], initialSystemUpdates: number) => {
			if (appsToUpdate.length === 0 && initialSystemUpdates === 0) return;

			setIsUpdatingAll(true);
			setUpdateAllOutput([]);
			setSystemUpdatesCount(initialSystemUpdates);
			setIsUpdatingSystem(false);
			setUpdateAllProgress({
				totalApps: appsToUpdate.length,
				currentAppIndex: 0,
				currentAppName: "",
				currentAppProgress: 0,
			});

			let errorCount = 0;
			const successfullyUpdatedAppIds: string[] = [];

			// ===== PHASE 1: Update user apps =====
			for (let i = 0; i < appsToUpdate.length; i++) {
				const app = appsToUpdate[i];

				// Update progress for current app
				setUpdateAllProgress({
					totalApps: appsToUpdate.length,
					currentAppIndex: i,
					currentAppName: app.name,
					currentAppProgress: 0,
				});

				setUpdateAllOutput((prev) => [
					...prev,
					"",
					`[${i + 1}/${appsToUpdate.length}] Actualizando ${app.name} (${app.appId})...`,
				]);

				try {
					const result = await updateFlatpakApp(app.appId, (progress) => {
						// Update progress bar
						setUpdateAllProgress((prev) => ({
							...prev,
							currentAppProgress: progress.progress ?? 0,
						}));

						// Add output line to terminal
						setUpdateAllOutput((prev) => [...prev, progress.output]);
					});

					if (result.success) {
						setUpdateAllOutput((prev) => [
							...prev,
							"",
							`✓ ${app.name} actualizado exitosamente`,
						]);
						successfullyUpdatedAppIds.push(app.appId);
					} else {
						errorCount++;
						setUpdateAllOutput((prev) => [
							...prev,
							"",
							`✗ Error al actualizar ${app.name} (código: ${result.exitCode})`,
						]);
					}
				} catch (error) {
					errorCount++;
					setUpdateAllOutput((prev) => [
						...prev,
						"",
						`✗ Error al actualizar ${app.name}: ${error}`,
					]);
				}

				// Mark this app as complete
				setUpdateAllProgress({
					totalApps: appsToUpdate.length,
					currentAppIndex: i + 1,
					currentAppName: app.name,
					currentAppProgress: 100,
				});
			}

			// ===== PHASE 2: Update system packages =====
			if (initialSystemUpdates > 0) {
				let currentSystemUpdates = initialSystemUpdates;

				// Recheck system updates if we updated user apps
				// (some runtimes might have been updated as dependencies)
				if (appsToUpdate.length > 0) {
					const updates = await checkAvailableUpdates();
					const currentUserAppUpdates = appsToUpdate.filter((app) =>
						updates.some((u) => u.appId === app.appId),
					).length;
					currentSystemUpdates = updates.length - currentUserAppUpdates;
					setSystemUpdatesCount(currentSystemUpdates);
				}

				if (currentSystemUpdates > 0) {
					setIsUpdatingSystem(true);
					setSystemUpdateProgress(0);
					setUpdateAllOutput((prev) => [
						...prev,
						"",
						`Actualizando ${currentSystemUpdates} paquete(s) del sistema (runtimes, extensiones, etc.)...`,
					]);

					try {
						const result = await updateSystemFlatpaks((progress) => {
							// Update progress bar
							setSystemUpdateProgress(progress.progress ?? 0);

							// Add output line to terminal
							setUpdateAllOutput((prev) => [...prev, progress.output]);
						});

						if (result.success) {
							setUpdateAllOutput((prev) => [
								...prev,
								"",
								"✓ Paquetes del sistema actualizados exitosamente",
							]);
							setSystemUpdateProgress(100);
						} else {
							errorCount++;
							setUpdateAllOutput((prev) => [
								...prev,
								"",
								`✗ Error al actualizar paquetes del sistema (código: ${result.exitCode})`,
							]);
						}
					} catch (error) {
						errorCount++;
						setUpdateAllOutput((prev) => [
							...prev,
							"",
							`✗ Error al actualizar paquetes del sistema: ${error}`,
						]);
					}

					// Mark system updates as complete
					setUpdateAllProgress((prev) => ({
						...prev,
						currentAppIndex: prev.totalApps + 1,
					}));
					setIsUpdatingSystem(false);
				} else {
					// All system updates were already installed during user app updates
					setIsUpdatingSystem(true);
					setSystemUpdateProgress(100);
					setUpdateAllOutput((prev) => [
						...prev,
						"",
						"✓ Los paquetes del sistema ya fueron actualizados como dependencias",
					]);
					setUpdateAllProgress((prev) => ({
						...prev,
						currentAppIndex: prev.totalApps + 1,
					}));
					setIsUpdatingSystem(false);
				}
			}

			// Mark permissions as outdated for successfully updated apps
			if (successfullyUpdatedAppIds.length > 0) {
				try {
					await dbCacheManager.markPermissionsAsOutdatedBatch(
						successfullyUpdatedAppIds,
					);
				} catch (error) {
					console.error(
						"Error marking permissions as outdated after batch update:",
						error,
					);
				}
			}

			// ===== PHASE 3: Complete =====
			setIsUpdatingAll(false);
			if (errorCount === 0) {
				setUpdateAllOutput((prev) => [
					...prev,
					"",
					"✓ Todas las actualizaciones completadas exitosamente",
				]);
			} else {
				setUpdateAllOutput((prev) => [
					...prev,
					"",
					`⚠ Actualizaciones completadas con ${errorCount} error(es)`,
				]);
			}

			// Call completion callback if provided
			if (onComplete) {
				onComplete();
			}
		},
		[onComplete],
	);

	const clearUpdateAll = useCallback(() => {
		setUpdateAllOutput([]);
		setUpdateAllProgress({
			totalApps: 0,
			currentAppIndex: 0,
			currentAppName: "",
			currentAppProgress: 0,
		});
		setSystemUpdateProgress(0);
	}, []);

	return {
		updateAll,
		isUpdatingAll,
		updateAllProgress,
		updateAllOutput,
		systemUpdatesCount,
		isUpdatingSystem,
		systemUpdateProgress,
		clearUpdateAll,
	};
}
