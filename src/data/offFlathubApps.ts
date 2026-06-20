import kliaKompressLogo from "../assets/internalPromo/klia_kompress_logo.png";
import type { CategoryApp } from "../types";

const GITHUB_RAW = "https://raw.githubusercontent.com/N3koSempai/klia-kompress/main";

export const OFF_FLATHUB_APPS: Record<string, CategoryApp> = {
	"io.github.N3kosempai.klia-kompress": {
		app_id: "io.github.N3kosempai.klia-kompress",
		name: "Klia Kompress",
		summary: "Desktop image compression and conversion tool built for privacy, speed, and quality.",
		description: "Klia Kompress is a desktop image compression and conversion tool built for privacy, speed, and quality. Everything runs locally on your machine — no uploads, no cloud, no servers.",
		id: "io.github.N3kosempai.klia-kompress",
		type: "desktop-application",
		translations: {},
		project_license: "LicenseRef-proprietary",
		is_free_license: false,
		icon: kliaKompressLogo,
		main_categories: "Utility",
		sub_categories: [],
		developer_name: "N3koSempai",
		verification_verified: true,
		verification_method: "none",
		verification_login_name: "N3koSempai",
		verification_login_provider: "github",
		verification_login_is_organization: null,
		verification_website: null,
		verification_timestamp: null,
		runtime: "org.gnome.Platform/x86_64/47",
		updated_at: 1748736000,
		arches: ["x86_64"],
		added_at: 1748736000,
		trending: 0,
		installs_last_month: 0,
		isMobileFriendly: false,
		keywords: ["compression", "archive", "zip", "tar"],
		screenshots: [
			{ sizes: [{ width: "1920", height: "1080", scale: "1", src: `${GITHUB_RAW}/screenshots/kompressHome.png` }] },
			{ sizes: [{ width: "1920", height: "1080", scale: "1", src: `${GITHUB_RAW}/screenshots/kompressSave.png` }] },
			{ sizes: [{ width: "1920", height: "1080", scale: "1", src: `${GITHUB_RAW}/screenshots/kompress_start.png` }] },
		],
		urls: {
			homepage: "https://github.com/N3koSempai/klia-kompress",
			vcs_browser: "https://github.com/N3koSempai/klia-kompress",
		},
	},
};

