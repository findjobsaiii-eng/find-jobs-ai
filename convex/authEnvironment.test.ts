import { describe, expect, it } from "vitest";
import {
  requireAuthEnvironmentValue,
  requireAuthSiteUrl,
} from "./authEnvironment";

describe("requireAuthEnvironmentValue", () => {
  it.each([undefined, "", "   "])(
    "rejects a missing or blank server value",
    (value) => {
      expect(() =>
        requireAuthEnvironmentValue("AUTH_GOOGLE_SECRET", value),
      ).toThrow("AUTH_GOOGLE_SECRET");
    },
  );

  it("returns a configured server value unchanged", () => {
    expect(requireAuthEnvironmentValue("AUTH_GOOGLE_ID", "client-id")).toBe(
      "client-id",
    );
  });

  it.each([
    undefined,
    "",
    "not-a-url",
    "http://example.com",
    "https://example.com/path",
    "https://user@example.com",
  ])("rejects an unsafe or missing SITE_URL", (value) => {
    expect(() => requireAuthSiteUrl(value)).toThrow("SITE_URL");
  });

  it.each(["https://app.example.com", "http://localhost:5173"])(
    "accepts a safe frontend origin",
    (value) => {
      expect(requireAuthSiteUrl(value)).toBe(value);
    },
  );
});
