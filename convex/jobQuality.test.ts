import { describe, expect, it } from "vitest";
import {
  evaluateJobQuality,
  isDisplayEligibleJob,
  MINIMUM_RELEVANCE_SCORE,
} from "./jobQuality";

const profile = {
  targetJobTitles: ["E-commerce Manager", "Website Manager"],
  currentRole: "E-commerce Site Manager",
  normalizedPastRoles: ["E-commerce Site Manager", "Web Content Specialist"],
  professionalDomains: ["E-commerce", "Retail website operations"],
  seniority: "mid",
  skills: ["Shopify", "WooCommerce", "HTML", "CSS", "Catalog management"],
  yearsOfExperience: 5,
  location: {
    placeId: "geonames:293703",
    formattedAddress: "Rishon LeZion",
    city: "Rishon LeZion",
    country: "Israel",
    countryCode: "IL",
    latitude: 31.97102,
    longitude: 34.78939,
    radiusKm: 25,
  },
  workArrangements: ["onsite", "hybrid", "remote"],
  employmentTypes: ["full-time", "part-time", "contract"],
  languages: [],
  minimumMonthlySalaryIls: 0,
};

function job(
  overrides: Partial<Parameters<typeof evaluateJobQuality>[0]> = {},
) {
  return {
    title: "E-commerce Manager",
    descriptionText: "Manage a retail online store and product catalog",
    requirementsText: null,
    responsibilities: ["Own online-store operations"],
    requiredSkills: ["Shopify", "Catalog management"],
    preferredSkills: [],
    requiredExperienceYearsMin: 3,
    requiredExperienceYearsMax: null,
    educationRequirements: [],
    languages: [],
    country: "Israel",
    city: "Rishon LeZion",
    locationText: "Rishon LeZion",
    geo: {
      latitude: 31.97102,
      longitude: 34.78939,
      countryCode: "IL",
    },
    workArrangement: "hybrid" as const,
    employmentType: "full-time" as const,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: null,
    workAuthorizationRequirements: null,
    ...overrides,
  };
}

describe("deterministic CV-backed relevance", () => {
  it("ranks a strong target-role match above the relevance threshold", () => {
    const result = evaluateJobQuality(job(), profile);
    expect(result.outcome).toBe("eligible");
    expect(result.relevanceScore).toBeGreaterThanOrEqual(
      MINIMUM_RELEVANCE_SCORE,
    );
    expect(result.matchReasons).toEqual(
      expect.arrayContaining(["target_role", "core_skills", "domain"]),
    );
  });

  it("ranks strong role and skills above generic title overlap", () => {
    const strong = evaluateJobQuality(job(), profile);
    const generic = evaluateJobQuality(
      job({
        title: "Digital Operations Manager",
        descriptionText: "Coordinate general business operations",
        responsibilities: ["Coordinate teams"],
        requiredSkills: ["Communication", "Problem solving"],
      }),
      profile,
    );
    expect(strong.relevanceScore).toBeGreaterThan(generic.relevanceScore);
    expect(generic.outcome).toBe("excluded");
  });

  it("does not let a generic manager token make a wrong domain relevant", () => {
    const result = evaluateJobQuality(
      job({
        title: "PPC Manager",
        descriptionText: "Own paid acquisition campaigns",
        responsibilities: ["Manage ad spend"],
        requiredSkills: ["Google Ads", "Paid media"],
      }),
      profile,
    );
    expect(result.outcome).toBe("excluded");
    expect(result.exclusionReasons).toContain("professional_mismatch");
  });

  it("uses previous substantial roles without accepting unrelated roles", () => {
    expect(
      evaluateJobQuality(
        job({ title: "Website Manager", requiredSkills: [] }),
        profile,
      ).outcome,
    ).toBe("eligible");
    expect(
      evaluateJobQuality(
        job({
          title: "Accountant",
          descriptionText: "Prepare financial reports",
          responsibilities: ["Reconcile accounts"],
          requiredSkills: ["Bookkeeping"],
        }),
        profile,
      ).outcome,
    ).toBe("excluded");
  });

  it("reduces or excludes a material seniority mismatch", () => {
    const matching = evaluateJobQuality(job(), profile);
    const head = evaluateJobQuality(
      job({ title: "Head of E-commerce" }),
      profile,
    );
    expect(head.relevanceScore).toBeLessThan(matching.relevanceScore);
    expect(head.exclusionReasons).toContain("seniority_conflict");
  });

  it("enforces the selected radius for onsite and hybrid jobs", () => {
    const result = evaluateJobQuality(
      job({
        city: "Be'er Sheva",
        locationText: "Be'er Sheva",
        geo: {
          latitude: 31.25297,
          longitude: 34.79146,
          countryCode: "IL",
        },
      }),
      profile,
    );
    expect(result.outcome).toBe("excluded");
    expect(result.exclusionReasons).toContain("location_conflict");
  });

  it("does not reject a remote role merely because it has no coordinates", () => {
    const result = evaluateJobQuality(
      job({
        city: null,
        locationText: "Remote, Israel",
        geo: undefined,
        workArrangement: "remote",
      }),
      profile,
    );
    expect(result.exclusionReasons).not.toContain("location_conflict");
    expect(result.outcome).toBe("eligible");
  });

  it("keeps inactive and duplicate records out of the feed before ranking", () => {
    const base = {
      lifecycleStatus: "verified_active" as const,
      canonicalJobId: undefined,
      bestSourceId: "source-id",
      lastVerifiedAt: Date.now(),
    };
    expect(isDisplayEligibleJob(base as never)).toBe(true);
    expect(
      isDisplayEligibleJob({ ...base, lifecycleStatus: "closed" } as never),
    ).toBe(false);
    expect(
      isDisplayEligibleJob({
        ...base,
        canonicalJobId: "canonical-id",
      } as never),
    ).toBe(false);
    expect(
      isDisplayEligibleJob({
        ...base,
        activityReason: "development_fixture_active",
      } as never),
    ).toBe(false);
  });
});
