import { describe, expect, it } from "vitest";
import {
  clearOAuthAttemptPending,
  getOAuthReturnUrl,
  getOAuthCallbackCode,
  hasOAuthAttemptPending,
  markOAuthAttemptPending,
  removeOAuthCallbackCode,
} from "./oauth-callback";

describe("OAuth callback utilities", () => {
  it("extracts a non-empty callback code", () => {
    expect(getOAuthCallbackCode("?code=one-time-code&next=jobs")).toBe(
      "one-time-code",
    );
    expect(getOAuthCallbackCode("?code=%20%20")).toBeNull();
  });

  it("removes the one-time code while preserving other URL state", () => {
    window.history.replaceState(
      null,
      "",
      "/callback?code=one-time-code&next=jobs#details",
    );

    expect(removeOAuthCallbackCode(window.location)).toBe(
      "/callback?next=jobs#details",
    );
  });

  it("builds a safe same-origin return URL for a nested app route", () => {
    window.history.replaceState(
      null,
      "",
      "/profile/languages?source=email&code=one-time-code&redirectTo=https://example.com#spoken",
    );

    expect(getOAuthReturnUrl(window.location)).toBe(
      "http://localhost:3000/profile/languages?source=email#spoken",
    );
  });

  it("tracks an OAuth round trip without storing credentials", () => {
    expect(hasOAuthAttemptPending(window.sessionStorage)).toBe(false);

    markOAuthAttemptPending(window.sessionStorage);
    expect(hasOAuthAttemptPending(window.sessionStorage)).toBe(true);

    clearOAuthAttemptPending(window.sessionStorage);
    expect(hasOAuthAttemptPending(window.sessionStorage)).toBe(false);
  });
});
