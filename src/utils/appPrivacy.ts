import type { AppPermissions, ContentRating } from "../types";

// Evalúa los permisos de sandbox de Flatpak y la clasificación de contenido
// (OARS) de una app y los resume en cuatro "focos" tipo semáforo.
//
// - Los permisos son hechos: los aplica el sandbox, no los declara el dev.
// - La clasificación de contenido sí es autodeclarada por el desarrollador.

export type PrivacyLevel = "safe" | "caution" | "high" | "unknown";
export type FindingLevel = "info" | "caution" | "high";
export type PrivacyFocusId = "storage" | "system" | "social" | "money";

export interface PrivacyFinding {
	// Sufijo de la clave i18n `privacy.findings.<id>`.
	id: string;
	level: FindingLevel;
	params?: Record<string, string | number>;
	// Permisos crudos que originan el hallazgo (se muestran como detalle técnico).
	raw?: string[];
}

export interface PrivacyFocus {
	id: PrivacyFocusId;
	level: PrivacyLevel;
	findings: PrivacyFinding[];
}

export interface AppPrivacyAssessment {
	foci: PrivacyFocus[];
	// false si no hay datos de ningún foco (la UI oculta el badge).
	hasData: boolean;
}

const FINDING_ORDER: Record<FindingLevel, number> = {
	info: 0,
	caution: 1,
	high: 2,
};

const levelFromFindings = (findings: PrivacyFinding[]): PrivacyLevel => {
	let max = 0;
	for (const f of findings) max = Math.max(max, FINDING_ORDER[f.level]);
	return max === 2 ? "high" : max === 1 ? "caution" : "safe";
};

const sortFindings = (findings: PrivacyFinding[]): PrivacyFinding[] =>
	[...findings].sort((a, b) => FINDING_ORDER[b.level] - FINDING_ORDER[a.level]);

// ---------------------------------------------------------------- Storage

const USER_FOLDERS = new Set([
	"xdg-documents",
	"xdg-download",
	"xdg-music",
	"xdg-pictures",
	"xdg-videos",
	"xdg-desktop",
	"xdg-public-share",
	"xdg-templates",
]);
const APP_DIR_PREFIXES = ["xdg-config", "xdg-data", "xdg-cache"];
const SYSTEM_PATH_PREFIXES = ["/run/", "/sys/", "/etc/", "/proc/"];
const REMOVABLE_PREFIXES = ["/media", "/run/media", "/mnt"];

interface ParsedFilesystem {
	path: string;
	mode: string | null;
}

const parseFilesystem = (entry: string): ParsedFilesystem | null => {
	// `!path` niega un acceso: no concede nada.
	if (entry.startsWith("!")) return null;
	const match = entry.match(/^(.*?)(?::(ro|rw|create))?$/);
	if (!match || !match[1]) return null;
	return { path: match[1], mode: match[2] ?? null };
};

const isRemovable = (path: string): boolean =>
	REMOVABLE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

export const assessStorage = (
	permissions: AppPermissions | undefined | null,
): PrivacyFocus => {
	if (!permissions) return { id: "storage", level: "unknown", findings: [] };

	const findings: PrivacyFinding[] = [];
	const userFolders: string[] = [];
	const userFolderRaw: string[] = [];
	const otherPaths: string[] = [];
	const appDirs: string[] = [];
	const removableRaw: string[] = [];

	for (const entry of permissions.filesystems ?? []) {
		const fs = parseFilesystem(entry);
		if (!fs) continue;
		const { path, mode } = fs;

		if (path === "home" || path === "~" || path.startsWith("~/")) {
			if (path === "home" || path === "~") {
				findings.push({ id: "storageHome", level: "high", raw: [entry] });
			} else {
				otherPaths.push(entry);
			}
		} else if (path === "host" || path === "/") {
			findings.push({ id: "storageHost", level: "high", raw: [entry] });
		} else if (path === "host-os" || path === "host-etc") {
			findings.push({ id: "storageHostOs", level: "caution", raw: [entry] });
		} else if (path.startsWith("xdg-run/")) {
			// Sockets de runtime (pipewire, keyring…): no son almacenamiento.
		} else if (APP_DIR_PREFIXES.some((p) => path.startsWith(p))) {
			// Solo lectura de temas/configuración compartida: ruido, se ignora.
			if (mode !== "ro") appDirs.push(entry);
		} else if (USER_FOLDERS.has(path.split("/")[0])) {
			userFolders.push(path.split("/")[0].replace("xdg-", ""));
			userFolderRaw.push(entry);
		} else if (isRemovable(path)) {
			removableRaw.push(entry);
		} else if (
			mode === "ro" &&
			SYSTEM_PATH_PREFIXES.some((p) => path.startsWith(p))
		) {
			// Sockets/dispositivos del sistema en solo lectura: ruido.
		} else {
			otherPaths.push(entry);
		}
	}

	if (userFolders.length > 0) {
		findings.push({
			id: "storageUserFolders",
			level: "caution",
			params: { folders: [...new Set(userFolders)].join(", ") },
			raw: userFolderRaw,
		});
	}
	if (removableRaw.length > 0) {
		findings.push({
			id: "storageRemovable",
			level: "caution",
			raw: removableRaw,
		});
	}
	if (otherPaths.length > 0) {
		findings.push({
			id: "storageOtherPaths",
			level: "caution",
			params: { count: otherPaths.length },
			raw: otherPaths,
		});
	}
	if (appDirs.length > 0) {
		findings.push({ id: "storageAppDirs", level: "info", raw: appDirs });
	}

	return {
		id: "storage",
		level: levelFromFindings(findings),
		findings: sortFindings(findings),
	};
};

// ----------------------------------------------------------------- System

const SECRET_SERVICES = [
	"org.freedesktop.secrets",
	"org.gnome.keyring",
	"org.kde.kwalletd5",
	"org.kde.kwalletd6",
];
const SENSITIVE_DEVICES = ["all", "input", "usb", "kvm"];
const SENSITIVE_FEATURES = ["devel", "bluetooth", "canbus"];

const matchesName = (name: string, service: string): boolean =>
	name === service || name.startsWith(`${service}.`);

export const assessSystem = (
	permissions: AppPermissions | undefined | null,
): PrivacyFocus => {
	if (!permissions) return { id: "system", level: "unknown", findings: [] };

	const findings: PrivacyFinding[] = [];
	const sockets = permissions.sockets ?? [];
	const devices = permissions.devices ?? [];
	const shared = permissions.shared ?? [];
	const features = permissions.features ?? [];
	const sessionTalk = permissions["session-bus"]?.talk ?? [];
	const systemBus = permissions["system-bus"];

	if (sockets.includes("session-bus")) {
		findings.push({
			id: "systemSessionBus",
			level: "high",
			raw: ["sockets: session-bus"],
		});
	}
	if (sockets.includes("system-bus")) {
		findings.push({
			id: "systemSystemBus",
			level: "high",
			raw: ["sockets: system-bus"],
		});
	}
	const flatpakTalk = sessionTalk.filter((n) =>
		matchesName(n, "org.freedesktop.Flatpak"),
	);
	if (flatpakTalk.length > 0) {
		findings.push({
			id: "systemFlatpakEscape",
			level: "high",
			raw: flatpakTalk.map((n) => `talk-name: ${n}`),
		});
	}
	if (sockets.includes("ssh-auth")) {
		findings.push({
			id: "systemSshAgent",
			level: "high",
			raw: ["sockets: ssh-auth"],
		});
	}
	if (sockets.includes("gpg-agent")) {
		findings.push({
			id: "systemGpgAgent",
			level: "high",
			raw: ["sockets: gpg-agent"],
		});
	}

	const secrets = sessionTalk.filter((n) =>
		SECRET_SERVICES.some((s) => matchesName(n, s)),
	);
	if (secrets.length > 0) {
		findings.push({
			id: "systemSecrets",
			level: "caution",
			raw: secrets.map((n) => `talk-name: ${n}`),
		});
	}

	const sensitiveDevices = devices.filter((d) => SENSITIVE_DEVICES.includes(d));
	if (sensitiveDevices.includes("all")) {
		findings.push({
			id: "systemDevicesAll",
			level: "caution",
			raw: ["devices: all"],
		});
	} else if (sensitiveDevices.length > 0) {
		findings.push({
			id: "systemDevicesSome",
			level: "caution",
			params: { devices: sensitiveDevices.join(", ") },
			raw: sensitiveDevices.map((d) => `devices: ${d}`),
		});
	}

	const sensitiveFeatures = features.filter((f) =>
		SENSITIVE_FEATURES.includes(f),
	);
	if (sensitiveFeatures.length > 0) {
		findings.push({
			id: "systemFeatures",
			level: "caution",
			params: { features: sensitiveFeatures.join(", ") },
			raw: sensitiveFeatures.map((f) => `features: ${f}`),
		});
	}
	if (sockets.includes("pcsc")) {
		findings.push({
			id: "systemSmartcard",
			level: "caution",
			raw: ["sockets: pcsc"],
		});
	}
	if ((systemBus?.talk?.length ?? 0) > 0 || (systemBus?.own?.length ?? 0) > 0) {
		findings.push({
			id: "systemSystemBusNames",
			level: "caution",
			raw: [
				...(systemBus?.talk ?? []).map((n) => `system-talk-name: ${n}`),
				...(systemBus?.own ?? []).map((n) => `system-own-name: ${n}`),
			],
		});
	}

	// Informativos: no cambian el color, pero el usuario debería poder verlos.
	if (shared.includes("network")) {
		findings.push({
			id: "systemNetwork",
			level: "info",
			raw: ["shared: network"],
		});
	}
	if (sockets.includes("pulseaudio")) {
		findings.push({
			id: "systemAudio",
			level: "info",
			raw: ["sockets: pulseaudio"],
		});
	}
	if (sockets.includes("x11")) {
		findings.push({ id: "systemX11", level: "info", raw: ["sockets: x11"] });
	}
	if (sockets.includes("cups")) {
		findings.push({
			id: "systemPrinting",
			level: "info",
			raw: ["sockets: cups"],
		});
	}

	return {
		id: "system",
		level: levelFromFindings(findings),
		findings: sortFindings(findings),
	};
};

// ----------------------------------------------------- Content rating (OARS)

const pickRating = (
	details: Record<string, ContentRating> | undefined | null,
): ContentRating | null => {
	if (!details) return null;
	return details.en_US ?? Object.values(details)[0] ?? null;
};

const ratingLevel = (
	rating: ContentRating,
	category: string,
): string | null => {
	const found = rating.categories?.find((c) => c.id === category);
	return found ? found.level : null;
};

const findingLevelFromRating = (level: string): FindingLevel =>
	level === "intense" ? "high" : level === "none" ? "info" : "caution";

const CONTENT_CATEGORIES = ["violence", "drugs", "sex", "language"] as const;

export const assessSocial = (
	details: Record<string, ContentRating> | undefined | null,
): PrivacyFocus => {
	const rating = pickRating(details);
	const social = rating ? ratingLevel(rating, "social") : null;
	if (!rating || !social || social === "unknown") {
		return { id: "social", level: "unknown", findings: [] };
	}

	const findings: PrivacyFinding[] = [];
	if (social !== "none") {
		findings.push({
			id: "socialInteraction",
			level: findingLevelFromRating(social),
			params: { level: social },
			raw: [`oars social: ${social}`],
		});
	}

	const age = rating.minimumAge ?? 0;
	if (age >= 13) {
		findings.push({
			id: "socialAge",
			level: age >= 18 ? "high" : "caution",
			params: { age },
			raw: [`oars minimumAge: ${age}`],
		});
	}

	// Resto de categorías de contenido: se listan, pero no afectan al color.
	for (const category of CONTENT_CATEGORIES) {
		const level = ratingLevel(rating, category);
		if (level && level !== "none" && level !== "unknown") {
			findings.push({
				id: `content_${category}`,
				level: "info",
				params: { level },
				raw: [`oars ${category}: ${level}`],
			});
		}
	}

	return {
		id: "social",
		level: levelFromFindings(findings.filter((f) => f.id.startsWith("social"))),
		findings: sortFindings(findings),
	};
};

// ------------------------------------------------------------------ Money

export const assessMoney = (
	details: Record<string, ContentRating> | undefined | null,
	hasDonation = false,
): PrivacyFocus => {
	const rating = pickRating(details);
	const money = rating ? ratingLevel(rating, "money") : null;
	if (!rating || !money || money === "unknown") {
		return { id: "money", level: "unknown", findings: [] };
	}

	const findings: PrivacyFinding[] = [];
	if (money !== "none") {
		findings.push({
			id: "moneyPurchases",
			level: findingLevelFromRating(money),
			params: { level: money },
			raw: [`oars money: ${money}`],
		});
	}
	// Las donaciones son voluntarias: informativo, no cambia el color.
	if (hasDonation) {
		findings.push({ id: "moneyDonations", level: "info" });
	}

	return {
		id: "money",
		level: levelFromFindings(findings),
		findings: sortFindings(findings),
	};
};

// --------------------------------------------------------------- Combined

export interface AppPrivacyInput {
	permissions: AppPermissions | undefined | null;
	contentRating: Record<string, ContentRating> | undefined | null;
	hasDonation?: boolean;
}

export const assessAppPrivacy = ({
	permissions,
	contentRating,
	hasDonation,
}: AppPrivacyInput): AppPrivacyAssessment => {
	const foci = [
		assessStorage(permissions),
		assessSystem(permissions),
		assessSocial(contentRating),
		assessMoney(contentRating, hasDonation),
	];
	return { foci, hasData: foci.some((f) => f.level !== "unknown") };
};
