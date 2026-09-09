import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import he from "./locales/he.json";

const resources = {
  en: { translation: en },
  he: { translation: he },
} as const;

function syncDocumentLanguage(language: string) {
  if (typeof document === "undefined") return;

  const resolvedLanguage = language.startsWith("he") ? "he" : "en";

  document.documentElement.lang = resolvedLanguage;
  document.documentElement.dir = resolvedLanguage === "he" ? "rtl" : "ltr";
  document.title = i18n.t("meta.title");
}

export async function initializeI18n() {
  if (!i18n.isInitialized) {
    await i18n
      .use(LanguageDetector)
      .use(initReactI18next)
      .init({
        resources,
        fallbackLng: "en",
        supportedLngs: ["en", "he"],
        detection: {
          order: ["localStorage", "navigator"],
          caches: ["localStorage"],
        },
        interpolation: { escapeValue: false },
      });

    i18n.on("languageChanged", syncDocumentLanguage);
  }

  syncDocumentLanguage(i18n.resolvedLanguage ?? i18n.language);
}

export default i18n;
