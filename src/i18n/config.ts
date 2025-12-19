import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import es from "./locales/es.json";

// Define resources type
const resources = {
  en: {
    translation: en,
  },
  es: {
    translation: es,
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
