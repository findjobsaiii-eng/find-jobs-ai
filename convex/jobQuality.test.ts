import { describe, expect, it } from "vitest";
import { evaluateJobQuality } from "./jobQuality";

const profile = {
  targetJobTitles: ["E-commerce Manager"],
  normalizedPastRoles: ["Website Manager"],
  professionalDomains: ["E-commerce"],
  seniority: "mid",
  skills: ["Shopify", "WooCommerce", "HTML", "CSS"],
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

function job(requiredSkills: string[]) {
  return {
    title: "E-commerce Manager",
    descriptionText: "Manage an online store",
    requirementsText: null,
    requiredSkills,
    preferredSkills: [],
    requiredExperienceYearsMin: 3,
    requiredExperienceYearsMax: null,
    educationRequirements: [],
    languages: [],
    country: "Israel",
    city: "Rishon LeZion",
    locationText: "Rishon LeZion",
    geo: {
      placeId: "geonames:293703",
      countryCode: "IL",
      latitude: 31.97102,
      longitude: 34.78939,
    },
    workArrangement: "hybrid" as const,
    employmentType: "full-time" as const,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: null,
    workAuthorizationRequirements: null,
  };
}

describe("deterministic CV-backed relevance", () => {
  it("ranks a role using effective target roles, skills, experience and location", () => {
    const strong = evaluateJobQuality(job(["Shopify", "WooCommerce"]), profile);
    const weaker = evaluateJobQuality(
      job(["Magento", "Salesforce Commerce Cloud"]),
      profile,
    );
    expect(strong.outcome).toBe("eligible");
    expect(strong.matchReasons).toEqual(
      expect.arrayContaining(["target_role", "core_skills", "location"]),
    );
    expect(strong.relevanceScore).toBeGreaterThan(weaker.relevanceScore);
  });

  it("can recognize a normalized past role without treating an unrelated role as relevant", () => {
    expect(
      evaluateJobQuality({ ...job([]), title: "Website Manager" }, profile)
        .outcome,
    ).toBe("eligible");
    expect(
      evaluateJobQuality({ ...job([]), title: "Accountant" }, profile).outcome,
    ).toBe("excluded");
  });
});
