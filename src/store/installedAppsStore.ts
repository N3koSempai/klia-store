import { create } from "zustand";

// Compara versiones tipo "1.2.3" numéricamente componente a componente;
// cualquier tramo no numérico cae a comparación de string como fallback.
function compareVersions(a: string, b: string): number {
	const partsA = a.split(".");
	const partsB = b.split(".");
	const len = Math.max(partsA.length, partsB.length);
	for (let i = 0; i < len; i++) {
		const numA = Number.parseInt(partsA[i] ?? "0", 10);
		const numB = Number.parseInt(partsB[i] ?? "0", 10);
		if (Number.isNaN(numA) || Number.isNaN(numB)) {
			return a.localeCompare(b);
		}
		if (numA !== numB) return numA - numB;
	}
	return 0;
}

// Al reportar dos fuentes (flathub/github) un update para el mismo appId, nos
// quedamos con la de versión más alta en vez de "el último checker que escribió".
function pickNewerUpdate(
	existing: UpdateAvailableInfo | undefined,
	incoming: UpdateAvailableInfo,
): UpdateAvailableInfo {
	if (!existing) return incoming;
	return compareVersions(incoming.newVersion, existing.newVersion) > 0
		? incoming
		: existing;
}

export type UpdateSource = "flathub" | "github";

export interface InstalledAppInfo {
	instanceId: string; // Unique identifier for each app instance (handles duplicates)
	appId: string;
	name: string;
	version: string;
	summary?: string;
	developer?: string; // Developer name extracted from app_id (e.g., "N3kosempai", "mozilla")
	permissions?: string[]; // Flatpak permissions (e.g., "camera", "files", "storage")
	installedSize?: number; // Installed size in bytes
	// Derivado del remote (`origin`) que reporta `flatpak list`: "flathub" si el
	// origin es un remote real de flathub, "github" si es un remote efímero
	// autogenerado por `flatpak install <bundle>.flatpak` (sufijo "-origin").
	// Se recalcula en cada refresh de get_installed_flatpaks, nunca se persiste.
	source: UpdateSource;
}

export interface InstalledExtensionInfo {
	extensionId: string;
	name: string;
	version: string;
	parentAppId: string;
}

export interface UpdateAvailableInfo {
	appId: string;
	newVersion: string;
	branch: string;
	changelog?: string;
	// De dónde viene esta actualización concreta. Necesario porque una misma
	// app puede tener updates detectados por dos checkers independientes
	// (flathub vía `flatpak remote-ls --updates` y github vía release tags);
	// sin esto, mergeAvailableUpdates/setAvailableUpdates se pisan por appId
	// y se pierde de dónde hay que instalar realmente la versión nueva.
	source: UpdateSource;
	githubRepo?: string;
}

interface InstalledAppsStore {
	// Mantiene la estructura key-value para verificación rápida
	installedApps: Record<string, boolean>;
	// Nueva estructura con información completa
	installedAppsInfo: InstalledAppInfo[];
	// Installed extensions mapped by parent app ID
	installedExtensions: Record<string, InstalledExtensionInfo[]>;
	// Apps que tienen actualizaciones disponibles
	availableUpdates: Record<string, UpdateAvailableInfo>;
	// Number of available updates for badge
	updateCount: number;
	// Loading state for initial updates check
	isLoadingUpdates: boolean;
	// Installed runtimes (for dependency checking)
	installedRuntimes: Set<string>;
	setInstalledApp: (appId: string, isInstalled: boolean) => void;
	setInstalledApps: (apps: Record<string, boolean>) => void;
	setInstalledAppsInfo: (apps: InstalledAppInfo[]) => void;
	setInstalledExtensions: (extensions: InstalledExtensionInfo[]) => void;
	setAvailableUpdates: (updates: UpdateAvailableInfo[]) => void;
	mergeAvailableUpdates: (updates: UpdateAvailableInfo[]) => void;
	clearAvailableUpdate: (appId: string) => void;
	setIsLoadingUpdates: (isLoading: boolean) => void;
	setInstalledRuntimes: (runtimes: string[]) => void;
	getInstallSource: (appId: string) => UpdateSource | undefined;
	isAppInstalled: (appId: string) => boolean;
	getInstalledAppsInfo: () => InstalledAppInfo[];
	getInstalledExtensionsForApp: (appId: string) => InstalledExtensionInfo[];
	hasUpdate: (appId: string) => boolean;
	getUpdateInfo: (appId: string) => UpdateAvailableInfo | undefined;
	getUpdateCount: () => number;
	isRuntimeInstalled: (runtimeRef: string) => boolean;
}

export const useInstalledAppsStore = create<InstalledAppsStore>((set, get) => ({
	installedApps: {},
	installedAppsInfo: [],
	installedExtensions: {},
	availableUpdates: {},
	updateCount: 0,
	isLoadingUpdates: true,
	installedRuntimes: new Set<string>(),

	setInstalledApp: (appId: string, isInstalled: boolean) =>
		set((state) => ({
			installedApps: {
				...state.installedApps,
				[appId]: isInstalled,
			},
		})),

	setInstalledApps: (apps: Record<string, boolean>) =>
		set({ installedApps: apps }),

	setInstalledAppsInfo: (apps: InstalledAppInfo[]) =>
		set(() => {
			// También actualizar installedApps para mantener retrocompatibilidad
			const installedAppsMap: Record<string, boolean> = {};
			for (const app of apps) {
				installedAppsMap[app.appId] = true;
			}
			return {
				installedAppsInfo: apps,
				installedApps: installedAppsMap,
			};
		}),

	setInstalledExtensions: (extensions: InstalledExtensionInfo[]) =>
		set(() => {
			// Group extensions by parent app ID
			const extensionsMap: Record<string, InstalledExtensionInfo[]> = {};
			for (const ext of extensions) {
				if (!extensionsMap[ext.parentAppId]) {
					extensionsMap[ext.parentAppId] = [];
				}
				extensionsMap[ext.parentAppId].push(ext);
			}
			return {
				installedExtensions: extensionsMap,
			};
		}),

	setAvailableUpdates: (updates: UpdateAvailableInfo[]) =>
		set((state) => {
			// setAvailableUpdates viene del checker de flathub (se recarga entero
			// en cada poll). No debe pisar updates de github ya detectados para
			// appIds que flathub ya no ve como pendientes.
			const merged: Record<string, UpdateAvailableInfo> = {};
			for (const [appId, existing] of Object.entries(state.availableUpdates)) {
				if (existing.source === "github") merged[appId] = existing;
			}
			for (const update of updates) {
				merged[update.appId] = pickNewerUpdate(merged[update.appId], update);
			}
			return {
				availableUpdates: merged,
				updateCount: Object.keys(merged).length,
				isLoadingUpdates: false,
			};
		}),

	mergeAvailableUpdates: (updates: UpdateAvailableInfo[]) =>
		set((state) => {
			const merged = { ...state.availableUpdates };
			for (const update of updates) {
				merged[update.appId] = pickNewerUpdate(merged[update.appId], update);
			}
			return {
				availableUpdates: merged,
				updateCount: Object.keys(merged).length,
			};
		}),

	// Las entradas con source "github" nunca se podan automáticamente por un
	// poll de flathub (setAvailableUpdates las preserva a propósito, ver
	// arriba), y el checker de github solo corre una vez por sesión — sin
	// esto, una app de github seguiría mostrando "actualización disponible"
	// para siempre después de actualizarla.
	clearAvailableUpdate: (appId: string) =>
		set((state) => {
			if (!(appId in state.availableUpdates)) return state;
			const merged = { ...state.availableUpdates };
			delete merged[appId];
			return {
				availableUpdates: merged,
				updateCount: Object.keys(merged).length,
			};
		}),

	setIsLoadingUpdates: (isLoading: boolean) =>
		set({ isLoadingUpdates: isLoading }),

	setInstalledRuntimes: (runtimes: string[]) => {
		console.log(
			`[installedAppsStore] Setting ${runtimes.length} runtimes, unique: ${new Set(runtimes).size}`,
		);
		console.log("[installedAppsStore] First 5 runtimes:", runtimes.slice(0, 5));
		return set({ installedRuntimes: new Set(runtimes) });
	},

	isAppInstalled: (appId: string) => {
		const state = get();
		return state.installedApps[appId] ?? false;
	},

	getInstalledAppsInfo: () => {
		const state = get();
		return state.installedAppsInfo;
	},

	getInstallSource: (appId: string) => {
		const state = get();
		return state.installedAppsInfo.find((app) => app.appId === appId)?.source;
	},

	getInstalledExtensionsForApp: (appId: string) => {
		const state = get();
		return state.installedExtensions[appId] ?? [];
	},

	hasUpdate: (appId: string) => {
		const state = get();
		return appId in state.availableUpdates;
	},

	getUpdateInfo: (appId: string) => {
		const state = get();
		return state.availableUpdates[appId];
	},

	getUpdateCount: () => {
		const state = get();
		return state.updateCount;
	},

	isRuntimeInstalled: (runtimeRef: string) => {
		const state = get();
		return state.installedRuntimes.has(runtimeRef);
	},
}));
