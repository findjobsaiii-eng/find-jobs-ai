const STORAGE_KEY = "jobmiter-cookie-consent";
export const COOKIE_CONSENT_VERSION = "2026-09-22";

export type CookieConsent = {
  version: string;
  analytics: boolean;
  decidedAt: string;
};

export function parseCookieConsent(value: string | null): CookieConsent | null {
  if (!value) return null;

  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("version" in parsed) ||
      parsed.version !== COOKIE_CONSENT_VERSION ||
      !("analytics" in parsed) ||
      typeof parsed.analytics !== "boolean" ||
      !("decidedAt" in parsed) ||
      typeof parsed.decidedAt !== "string" ||
      !Number.isFinite(Date.parse(parsed.decidedAt))
    ) {
      return null;
    }
    return parsed as CookieConsent;
  } catch {
    return null;
  }
}

export function readCookieConsent(): CookieConsent | null {
  try {
    return parseCookieConsent(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function saveCookieConsent(analytics: boolean): CookieConsent | null {
  const consent: CookieConsent = {
    version: COOKIE_CONSENT_VERSION,
    analytics,
    decidedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
    return consent;
  } catch {
    return null;
  }
}
