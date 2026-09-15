import { describe, expect, it } from "vitest";
import { applicationStatusesInUse } from "./application-status";

describe("application stage filters", () => {
  it("returns only statuses in use and keeps pipeline order", () => {
    expect(
      applicationStatusesInUse([
        "offer",
        "saved",
        "offer",
        undefined,
        "phone_screen",
      ]),
    ).toEqual(["saved", "phone_screen", "offer"]);
  });
});
