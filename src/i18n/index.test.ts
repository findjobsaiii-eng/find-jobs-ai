import { beforeEach, describe, expect, it, vi } from "vitest";

describe("interface language defaults", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  it("defaults a first-time visitor to Hebrew regardless of browser language", async () => {
    Object.defineProperty(window.navigator, "language", {
      configurable: true,
      value: "en-US",
    });
    const { default: i18n, initializeI18n } = await import("./index");

    await initializeI18n();

    expect(i18n.resolvedLanguage).toBe("he");
    expect(document.documentElement).toHaveAttribute("lang", "he");
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
  });

  it("preserves a visitor's explicit English preference", async () => {
    window.localStorage.setItem("i18nextLng", "en");
    const { default: i18n, initializeI18n } = await import("./index");

    await initializeI18n();

    expect(i18n.resolvedLanguage).toBe("en");
    expect(document.documentElement).toHaveAttribute("lang", "en");
    expect(document.documentElement).toHaveAttribute("dir", "ltr");
  });
});
