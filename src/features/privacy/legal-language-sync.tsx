"use client";

import { useEffect } from "react";
import i18n from "@/i18n";

export function LegalLanguageSync({ language }: { language: "he" | "en" }) {
  useEffect(() => {
    if (i18n.resolvedLanguage !== language) {
      void i18n.changeLanguage(language);
    }
  }, [language]);
  return null;
}
