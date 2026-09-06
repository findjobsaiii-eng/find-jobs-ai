import { describe, expect, it } from "vitest";
import { parseConvexUrl } from "./convex-url";

describe("parseConvexUrl", () => {
  it.each([undefined, "", "not-a-url", "ftp://example.com"])(
    "rejects an unusable public Convex URL",
    (value) => {
      expect(parseConvexUrl(value)).toBeNull();
    },
  );

  it("accepts an HTTPS deployment origin", () => {
    expect(parseConvexUrl("https://example.convex.cloud")).toBe(
      "https://example.convex.cloud",
    );
  });

  it.each([
    "https://example.convex.cloud/path",
    "https://example.convex.cloud?debug=true",
    "https://user@example.convex.cloud",
  ])("rejects a deployment URL containing unexpected URL data", (value) => {
    expect(parseConvexUrl(value)).toBeNull();
  });

  it.each(["http://localhost:3210", "http://127.0.0.1:3210"])(
    "accepts an HTTP local backend",
    (value) => {
      expect(parseConvexUrl(value)).toBe(value);
    },
  );

  it("rejects insecure remote backends", () => {
    expect(parseConvexUrl("http://example.convex.cloud")).toBeNull();
  });
});
