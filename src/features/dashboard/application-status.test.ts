import { describe, expect, it } from "vitest";
import { matchesApplicationFilter } from "./application-status";

describe("application stage filters", () => {
  it("groups pipeline stages without losing saved or closed jobs", () => {
    expect(matchesApplicationFilter("saved", "applied")).toBe(true);
    expect(matchesApplicationFilter("applied", "applied")).toBe(true);
    expect(matchesApplicationFilter("final_interview", "interviewing")).toBe(
      true,
    );
    expect(matchesApplicationFilter("offer", "offer")).toBe(true);
    expect(matchesApplicationFilter("withdrawn", "closed")).toBe(true);
    expect(matchesApplicationFilter("rejected", "interviewing")).toBe(false);
  });
});
