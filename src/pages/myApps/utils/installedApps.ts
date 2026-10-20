import type { InstalledAppInfo } from "../../../store/installedAppsStore.ts";
import type {
	DebAppRust,
	InstalledAppRust,
	InstalledExtensionRust,
} from "../types.ts";

export const toInstalledAppInfo = (
	app: InstalledAppRust,
): InstalledAppInfo => ({
	instanceId: `${app.app_id}-${app.version}`,
	appId: app.app_id,
	name: app.name,
	version: app.version,
	summary: app.summary,
	developer: app.developer,
	source: app.source,
});

export const toInstalledExtensionInfo = (ext: InstalledExtensionRust) => ({
	extensionId: ext.extension_id,
	name: ext.name,
	version: ext.version,
	parentAppId: ext.parent_app_id,
});

export const toDebAppInfo = (d: DebAppRust): InstalledAppInfo => ({
	instanceId: `deb-${d.package}`,
	appId: d.package,
	name: d.name,
	version: d.version,
	summary: d.summary,
	developer: undefined,
	source: "deb",
	iconPath: d.icon_path,
});

type NamedApp = { appId: string; name: string };

// Apps with pending updates first (unless updates are still loading), then
// alphabetically by name.
export const sortInstalledApps = <T extends NamedApp>(
	apps: T[],
	availableUpdates: Record<string, unknown>,
	isLoadingUpdates: boolean,
): T[] => {
	const copy = [...apps];
	if (isLoadingUpdates) {
		return copy.sort((a, b) => a.name.localeCompare(b.name));
	}
	return copy.sort((a, b) => {
		const aHasUpdate = a.appId in availableUpdates;
		const bHasUpdate = b.appId in availableUpdates;
		if (aHasUpdate && !bHasUpdate) return -1;
		if (!aHasUpdate && bHasUpdate) return 1;
		return a.name.localeCompare(b.name);
	});
};

// .deb apps: alphabetical only, no update logic.
export const sortDebApps = <T extends { name: string }>(apps: T[]): T[] =>
	[...apps].sort((a, b) => a.name.localeCompare(b.name));
