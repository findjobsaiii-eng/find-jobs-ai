import { describe, expect, it } from "vitest";
import { usableSalaryEstimate } from "./jobReviewModel";
const estimate = {
  min: 18000,
  max: 25000,
  currency: "ILS" as const,
  period: "month" as const,
  basis: "Mid-level frontend role.",
};
describe("informational salary estimates", () => {
  it("accepts a guess only when the listing has no pay", () => {
    expect(
      usableSalaryEstimate({ salaryMin: null, salaryMax: null }, estimate),
    ).toEqual(estimate);
    expect(
      usableSalaryEstimate({ salaryMin: null, salaryMax: 20000 }, estimate),
    ).toBeNull();
    expect(
      usableSalaryEstimate({ salaryMin: 20000, salaryMax: null }, estimate),
    ).toBeNull();
  });
  it("keeps missing estimates unknown and rejects inverted ranges", () => {
    expect(
      usableSalaryEstimate({ salaryMin: null, salaryMax: null }, null),
    ).toBeNull();
    expect(
      usableSalaryEstimate(
        { salaryMin: null, salaryMax: null },
        { ...estimate, min: 30000 },
      ),
    ).toBeNull();
  });
});
