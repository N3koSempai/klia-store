import { create } from "zustand";

export interface InstalledAppInfo {
	appId: string;
	name: string;
	version: string;
	summary?: string;
	developer?: string; // Developer name extracted from app_id (e.g., "N3kosempai", "mozilla")
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
	setIsLoadingUpdates: (isLoading: boolean) => void;
	setInstalledRuntimes: (runtimes: string[]) => void;
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
		set(() => {
			const updatesMap: Record<string, UpdateAvailableInfo> = {};
			for (const update of updates) {
				updatesMap[update.appId] = update;
			}
			return {
				availableUpdates: updatesMap,
				updateCount: updates.length,
				isLoadingUpdates: false,
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
