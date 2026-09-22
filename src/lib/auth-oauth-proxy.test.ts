import { describe, expect, it } from "vitest";
import {
  isAllowedOAuthProxyPath,
  normalizeFirstPartyOAuthCookie,
} from "./auth-oauth-proxy";

describe("first-party OAuth proxy", () => {
  it("uses a Safari-compatible first-party PKCE cookie", () => {
    expect(
      normalizeFirstPartyOAuthCookie(
        "__Host-googleOAuthpkce=value; Path=/; HttpOnly; Secure; SameSite=None; Partitioned",
      ),
    ).toBe(
      "__Host-googleOAuthpkce=value; Path=/; HttpOnly; Secure; SameSite=Lax",
    );
  });

  it("normalizes cookie deletion with the same first-party attributes", () => {
    expect(
      normalizeFirstPartyOAuthCookie(
        "__Host-googleOAuthpkce=; Max-Age=0; Path=/; Secure; SameSite=None; Partitioned",
      ),
    ).toContain("SameSite=Lax");
  });

  it("does not modify unrelated cookies", () => {
    const cookie = "other=value; Secure; SameSite=None; Partitioned";
    expect(normalizeFirstPartyOAuthCookie(cookie)).toBe(cookie);
  });

  it("only proxies the configured Google sign-in and callback routes", () => {
    expect(isAllowedOAuthProxyPath(["signin", "google"])).toBe(true);
    expect(isAllowedOAuthProxyPath(["callback", "google"])).toBe(true);
    expect(isAllowedOAuthProxyPath(["callback", "github"])).toBe(false);
    expect(isAllowedOAuthProxyPath(["callback", "google", "extra"])).toBe(
      false,
    );
  });
});
