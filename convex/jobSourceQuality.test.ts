import { describe, expect, it } from "vitest";
import { classifyJobSource } from "./jobSourceQuality";

describe("job source quality", () => {
  it.each([
    ["jobs.workable.com", "ats", "ats_direct"],
    ["jobs.comeet.co", "ats", "ats_direct"],
    ["career5.successfactors.com", "ats", "ats_direct"],
    ["il.linkedin.com", "job_board", "major_job_board"],
    ["jobify360.co.il", "job_board", "major_job_board"],
    ["jobswipe.co", "aggregator", "aggregator"],
  ] as const)("classifies %s", (domain, sourceTier, sourceFamily) => {
    expect(classifyJobSource(domain, "employer")).toMatchObject({
      sourceTier,
      sourceFamily,
    });
  });

  it("keeps an unknown employer-owned domain direct", () => {
    expect(
      classifyJobSource("careers.example.co.il", "employer"),
    ).toMatchObject({
      sourceTier: "employer",
      sourceFamily: "employer_direct",
    });
  });
});
