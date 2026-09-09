import { describe, expect, it } from "vitest";
import { isUserFacingJobSource } from "./jobSourceProvenance";

describe("job source provenance", () => {
  it("keeps development fixtures out of user-facing catalog paths", () => {
    expect(
      isUserFacingJobSource({ verificationMethod: "http_content_v1" }),
    ).toBe(true);
    expect(
      isUserFacingJobSource({ verificationMethod: "development_fixture" }),
    ).toBe(false);
    expect(isUserFacingJobSource(undefined)).toBe(false);
  });
});
