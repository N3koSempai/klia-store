import { create } from "zustand";

export interface InstalledAppInfo {
	appId: string;
	name: string;
	version: string;
	summary?: string;
}

export interface UpdateAvailableInfo {
	appId: string;
	newVersion: string;
	branch: string;
}

interface InstalledAppsStore {
	// Mantiene la estructura key-value para verificación rápida
	installedApps: Record<string, boolean>;
	// Nueva estructura con información completa
	installedAppsInfo: InstalledAppInfo[];
	// Apps que tienen actualizaciones disponibles
	availableUpdates: Record<string, UpdateAvailableInfo>;
	// Number of available updates for badge
	updateCount: number;
	// Loading state for initial updates check
	isLoadingUpdates: boolean;
	setInstalledApp: (appId: string, isInstalled: boolean) => void;
	setInstalledApps: (apps: Record<string, boolean>) => void;
	setInstalledAppsInfo: (apps: InstalledAppInfo[]) => void;
	setAvailableUpdates: (updates: UpdateAvailableInfo[]) => void;
	setIsLoadingUpdates: (isLoading: boolean) => void;
	isAppInstalled: (appId: string) => boolean;
	getInstalledAppsInfo: () => InstalledAppInfo[];
	hasUpdate: (appId: string) => boolean;
	getUpdateInfo: (appId: string) => UpdateAvailableInfo | undefined;
	getUpdateCount: () => number;
}

export const useInstalledAppsStore = create<InstalledAppsStore>((set, get) => ({
	installedApps: {},
	installedAppsInfo: [],
	availableUpdates: {},
	updateCount: 0,
	isLoadingUpdates: true,

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

	isAppInstalled: (appId: string) => {
		const state = get();
		return state.installedApps[appId] ?? false;
	},

	getInstalledAppsInfo: () => {
		const state = get();
		return state.installedAppsInfo;
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
}));
