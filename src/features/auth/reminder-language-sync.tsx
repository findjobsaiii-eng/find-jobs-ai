"use client";
import { useEffect } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../convex/_generated/api";

export function ReminderLanguageSync() {
  const { isAuthenticated } = useConvexAuth();
  const { i18n } = useTranslation();
  const updateLanguage = useMutation(api.onboardingReminders.updateMyLanguage);
  const language = i18n.resolvedLanguage === "en" ? "en" : "he";
  useEffect(() => {
    if (isAuthenticated) void updateLanguage({ language }).catch(() => {});
  }, [isAuthenticated, language, updateLanguage]);
  return null;
}
