import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import es from "./locales/es.json";
import pt from "./locales/pt.json";
import ru from "./locales/ru.json";
import zh from "./locales/zh.json";
import hi from "./locales/hi.json";

// Define resources type
const resources = {
  en: {
    translation: en,
  },
  es: {
    translation: es,
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

// Get system language or default to 'en'
const getSystemLanguage = () => {
  const lang = navigator.language || (navigator as any).userLanguage || "en";
  return lang.split("-")[0]; // Use 'es' instead of 'es-ES'
};

i18n.use(initReactI18next).init({
  resources,
  lng: getSystemLanguage(), // Auto-detect language
  fallbackLng: "en",
  interpolation: {
    escapeValue: false, // React already escapes values
  },
});

export default i18n;
