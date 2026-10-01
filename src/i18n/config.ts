import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { isTauri } from "@tauri-apps/api/core";
import en from "./locales/en.json";
import es from "./locales/es.json";
import hi from "./locales/hi.json";
import ja from "./locales/ja.json";
import pt from "./locales/pt.json";
import ru from "./locales/ru.json";
import zh from "./locales/zh.json";

// Define resources type
const resources = {
	en: {
		translation: en,
	},
	es: {
		translation: es,
	},
	ja: {
		translation: ja,
	},
	pt: {
		translation: pt,
	},
	ru: {
		translation: ru,
	},
	zh: {
		translation: zh,
	},
	hi: {
		translation: hi,
	},
} as const;

// Get the system language, preferring the OS locale reported by Tauri.
// On Linux (WebKitGTK), `navigator.language` only follows LC_ALL and
// ignores LANG, so a session with e.g. LANG=zh_CN.UTF-8 still reports
// "en-US" and the UI falls back to English. The Tauri OS plugin reads
// the environment directly, which gives the correct answer there; the
// navigator path remains as a fallback (plain browser, plugin failure).
const getSystemLanguage = async (): Promise<string> => {
	if (isTauri()) {
		try {
			const { locale } = await import("@tauri-apps/plugin-os");
			const osLocale = await locale();
			if (osLocale) {
				// "zh-CN" / "zh_CN" -> "zh"
				return osLocale.split(/[-_]/)[0];
			}
		} catch (error) {
			console.warn(
				"OS locale detection failed, falling back to navigator.language",
				error,
			);
		}
	}
	const lang =
		navigator.language ||
		(navigator as Navigator & { userLanguage?: string }).userLanguage ||
		"en";
	return lang.split("-")[0]; // Use 'es' instead of 'es-ES'
};

await i18n.use(initReactI18next).init({
	resources,
	lng: await getSystemLanguage(), // Auto-detect language
	fallbackLng: "en",
	interpolation: {
		escapeValue: false, // React already escapes values
	},
});

export default i18n;
