export interface InstalledAppRust {
	app_id: string;
	name: string;
	version: string;
	summary?: string;
	developer?: string;
	installed_size?: number;
	source: "flathub" | "github";
}

export interface InstalledExtensionRust {
	extension_id: string;
	name: string;
	version: string;
	parent_app_id: string;
}

export interface InstalledPackagesResponse {
	apps: InstalledAppRust[];
	runtimes: string[];
	extensions: InstalledExtensionRust[];
}

export interface DebAppRust {
	package: string;
	name: string;
	version: string;
	summary?: string;
	icon_path?: string;
}
