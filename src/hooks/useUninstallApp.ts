import { useCallback, useState } from "react";
import { uninstallFlatpakApp } from "../utils/flatpakOperations";

interface UseUninstallAppReturn {
	uninstallApp: (appId: string, appName?: string) => Promise<boolean>;
	uninstallingApp: string | null;
	isUninstalling: boolean;
	uninstallOutput: string[];
	clearUninstall: () => void;
}

export function useUninstallApp(): UseUninstallAppReturn {
	const [uninstallingApp, setUninstallingApp] = useState<string | null>(null);
	const [isUninstalling, setIsUninstalling] = useState(false);
	const [uninstallOutput, setUninstallOutput] = useState<string[]>([]);

	const uninstallApp = useCallback(
		async (appId: string, appName?: string) => {
			setUninstallingApp(appId);
			setIsUninstalling(true);
			setUninstallOutput([
				`Preparando desinstalación de ${appName || appId}...`,
				"",
			]);

			try {
				const result = await uninstallFlatpakApp(appId);

				// Set final output from the operation
				setUninstallOutput(result.output);

				if (result.success) {
					setUninstallOutput((prev) => [
						...prev,
						"",
						"✓ Desinstalación completada exitosamente",
					]);
				} else {
					setUninstallOutput((prev) => [
						...prev,
						"",
						`✗ Error en la desinstalación (código: ${result.exitCode})`,
					]);
				}

				setIsUninstalling(false);
				return result.success;
			} catch (error) {
				setUninstallOutput((prev) => [
					...prev,
					"",
					`✗ Error al ejecutar comando: ${error}`,
				]);
				setIsUninstalling(false);
				return false;
			}
		},
		[],
	);

	const clearUninstall = useCallback(() => {
		setUninstallingApp(null);
		setUninstallOutput([]);
	}, []);

	return {
		uninstallApp,
		uninstallingApp,
		isUninstalling,
		uninstallOutput,
		clearUninstall,
	};
}
