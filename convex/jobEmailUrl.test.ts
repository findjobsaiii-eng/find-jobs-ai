// @vitest-environment node

import { describe, expect, it } from "vitest";
import { requirePublicAppUrl } from "./jobEmailUrl";

describe("job email public URL", () => {
  it("normalizes a public HTTPS origin", () => {
    expect(requirePublicAppUrl(" https://jobmiter.com/ ")).toBe(
      "https://jobmiter.com",
    );
  });

  it.each([
    "http://localhost:3000",
    "https://localhost",
    "https://127.0.0.1",
    "https://192.168.1.20",
    "https://app.local",
    "http://jobmiter.com",
    "https://jobmiter.com/some-path",
    "https://jobmiter.com?source=email",
    "https://user:secret@jobmiter.com",
  ])("rejects a non-public app origin: %s", (value) => {
    expect(() => requirePublicAppUrl(value)).toThrow(/PUBLIC_APP_URL/u);
  });
});
