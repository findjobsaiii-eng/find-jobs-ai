import { createInstance } from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import he from "./locales/he.json";

const i18n = createInstance();

const resources = {
  en: { translation: en },
  he: { translation: he },
} as const;

function syncDocumentLanguage(language: string) {
  if (typeof document === "undefined") return;

  const resolvedLanguage = language.startsWith("he") ? "he" : "en";

  document.documentElement.lang = resolvedLanguage;
  document.documentElement.dir = resolvedLanguage === "he" ? "rtl" : "ltr";
}

// Hebrew is ready synchronously for server rendering and the first hydration.
// Apply the saved browser preference only after hydration.
void i18n.use(initReactI18next).init({
  resources,
  lng: "he",
  fallbackLng: "he",
  supportedLngs: ["en", "he"],
  initAsync: false,
  interpolation: { escapeValue: false },
});

const detector = new LanguageDetector(undefined, {
  order: ["localStorage"],
  caches: ["localStorage"],
});
i18n.on("languageChanged", (language) => {
  detector.cacheUserLanguage(language);
  syncDocumentLanguage(language);
});

export async function initializeI18n() {
  if (typeof window === "undefined") return;
  const detected = detector.detect();
  const languages = Array.isArray(detected) ? detected : [detected];
  const language =
    languages.find((value) => value === "he" || value === "en") ?? "he";
  if (i18n.resolvedLanguage !== language) await i18n.changeLanguage(language);
  syncDocumentLanguage(i18n.resolvedLanguage ?? i18n.language);
}

export default i18n;
