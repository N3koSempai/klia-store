import { isTauri } from "@tauri-apps/api/core";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Each locale is its own chunk; only English (fallback) and the detected
// language are loaded at startup.
const loaders = import.meta.glob<{ default: Record<string, unknown> }>(
	"./locales/*.json",
);

const loadLocale = async (
	lang: string,
): Promise<Record<string, unknown> | undefined> => {
	const loader = loaders[`./locales/${lang}.json`];
	return loader ? (await loader()).default : undefined;
};

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

const lng = await getSystemLanguage(); // Auto-detect language
const [en, detected] = await Promise.all([
	loadLocale("en"),
	lng === "en" ? undefined : loadLocale(lng),
]);

await i18n.use(initReactI18next).init({
	resources: {
		en: { translation: en ?? {} },
		...(detected ? { [lng]: { translation: detected } } : {}),
	},
	lng,
	fallbackLng: "en",
	interpolation: {
		escapeValue: false, // React already escapes values
	},
});

export default i18n;
