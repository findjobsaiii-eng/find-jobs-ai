"use client";

import { createContext, useContext } from "react";

export const CookiePreferencesContext = createContext<(() => void) | null>(
  null,
);

export function useCookiePreferences() {
  const openPreferences = useContext(CookiePreferencesContext);
  if (!openPreferences) {
    throw new Error("Cookie preferences must be used inside the provider");
  }
  return openPreferences;
}
