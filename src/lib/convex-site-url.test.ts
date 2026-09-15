import { describe, expect, it } from "vitest";
import { resolveConvexSiteUrl } from "./convex-site-url";

describe("resolveConvexSiteUrl", () => {
  it("derives the HTTP actions origin from a standard Convex Cloud URL", () => {
    expect(
      resolveConvexSiteUrl(undefined, "https://example.convex.cloud"),
    ).toBe("https://example.convex.site");
  });

  it("uses an explicitly configured site origin for custom deployments", () => {
    expect(
      resolveConvexSiteUrl(
        "https://auth.example.com",
        "https://example.convex.cloud",
      ),
    ).toBe("https://auth.example.com");
  });

  it.each([
    "http://auth.example.com",
    "https://auth.example.com/path",
    "https://user@auth.example.com",
  ])("rejects an unsafe explicit site URL", (value) => {
    expect(() => resolveConvexSiteUrl(value, undefined)).toThrow(
      "NEXT_PUBLIC_CONVEX_SITE_URL",
    );
  });

  it("requires an explicit origin for non-standard deployments", () => {
    expect(() =>
      resolveConvexSiteUrl(undefined, "https://convex.example.com"),
    ).toThrow("Set NEXT_PUBLIC_CONVEX_SITE_URL");
  });
});
