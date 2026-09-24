import { describe, expect, it } from "vitest";
import {
  classifyMatchQuality,
  evaluateJobQuality,
  isDisplayEligibleJob,
  MINIMUM_RELEVANCE_SCORE,
  PARTIAL_MATCH_MINIMUM_SCORE,
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

  it("uses score bands without turning a sub-58 score into a hard exclusion", () => {
    const result = evaluateJobQuality(
      job({
        title: "Frontend Content Specialist",
        descriptionText: "Maintain content in a React website",
        responsibilities: ["Maintain website content"],
        requiredSkills: ["CMS"],
        preferredSkills: [],
      }),
      profile,
    );
    expect(result.hardEligibilityPassed).toBe(true);
    expect(result.outcome).toBe("eligible");
    expect(result.relevanceScore).toBeLessThan(MINIMUM_RELEVANCE_SCORE);
    expect(result.matchQuality).toBe("possible");
    expect(result.exclusionReasons).not.toContain("below_relevance_threshold");
    expect(classifyMatchQuality(MINIMUM_RELEVANCE_SCORE)).toBe("strong");
    expect(classifyMatchQuality(PARTIAL_MATCH_MINIMUM_SCORE)).toBe("partial");
    expect(classifyMatchQuality(PARTIAL_MATCH_MINIMUM_SCORE - 1)).toBe(
      "possible",
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
    expect(generic.hardEligibilityPassed).toBe(true);
    expect(generic.outcome).toBe("eligible");
    expect(generic.matchQuality).not.toBe("strong");
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

  it("does not give unrecognized professional domains a neutral pass", () => {
    const programProfile = {
      ...profile,
      targetJobTitles: ["Academic Program Manager", "Program Coordinator"],
      currentRole: "Instructional Designer",
      normalizedPastRoles: ["Research Project Coordinator"],
      professionalDomains: ["Higher education", "Instructional design"],
      skills: ["Program management", "Instructional design", "Research"],
    };
    const result = evaluateJobQuality(
      job({
        title: "Software Engineer",
        descriptionText: "Build distributed services and production APIs",
        responsibilities: ["Develop backend systems"],
        requiredSkills: ["Go", "Kubernetes"],
      }),
      programProfile,
    );
    expect(result.hardEligibilityPassed).toBe(false);
    expect(result.exclusionReasons).toContain("professional_mismatch");
  });

  it("does not treat incidental department names as the job's profession", () => {
    const result = evaluateJobQuality(
      job({
        title: "Technical Product Manager - Video Surveillance",
        descriptionText:
          "Lead a video-surveillance portfolio and work with R&D, sales, marketing, manufacturing, service teams, and global customers.",
        responsibilities: ["Own the CCTV and IoT product roadmap"],
        requiredSkills: [
          "Technical product management",
          "Video surveillance",
          "CCTV",
          "Networking",
          "IoT",
        ],
      }),
      profile,
    );
    expect(result.hardEligibilityPassed).toBe(false);
    expect(result.exclusionReasons).toContain("professional_mismatch");
  });

  it("recognizes CRM and business automation as a primary professional family", () => {
    const crmProfile = {
      ...profile,
      targetJobTitles: ["CRM Automation / Implementation"],
      currentRole: "CRM Implementer",
      normalizedPastRoles: ["CRM Systems Specialist"],
      professionalDomains: ["CRM implementation and business automation"],
      skills: ["CRM", "Salesforce", "Workflow automation"],
    };
    const result = evaluateJobQuality(
      job({
        title: "CRM and Automation Manager",
        descriptionText:
          "Implement CRM workflows and automate customer operations.",
        responsibilities: ["Own workflow automation"],
        requiredSkills: ["CRM", "Workflow automation"],
      }),
      crmProfile,
    );
    expect(result.hardEligibilityPassed).toBe(true);
    expect(result.outcome).toBe("eligible");
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

  it("ranks a stretch seniority match lower without hiding it", () => {
    const matching = evaluateJobQuality(job(), profile);
    const head = evaluateJobQuality(
      job({ title: "Head of E-commerce" }),
      profile,
    );
    expect(head.relevanceScore).toBeLessThan(matching.relevanceScore);
    expect(head.outcome).toBe("eligible");
    expect(head.exclusionReasons).not.toContain("seniority_conflict");
  });

  it("hard-excludes 0 years from a role requiring 4-5 years", () => {
    const result = evaluateJobQuality(
      job({
        requirementsText: "4-5 years of relevant experience",
        requiredExperienceYearsMin: 4,
        requiredExperienceYearsMax: 5,
      }),
      { ...profile, yearsOfExperience: 0, seniority: "entry" },
    );
    expect(result.outcome).toBe("excluded");
    expect(result.hardEligibilityPassed).toBe(false);
    expect(result.exclusionReasons).toContain("experience_conflict");
  });

  it("accepts exact experience and the lower bound of a range", () => {
    const exact = evaluateJobQuality(
      job({ requiredExperienceYearsMin: 5, requiredExperienceYearsMax: 5 }),
      profile,
    );
    const range = evaluateJobQuality(
      job({ requiredExperienceYearsMin: 5, requiredExperienceYearsMax: 8 }),
      profile,
    );
    expect(exact.outcome).toBe("eligible");
    expect(range.outcome).toBe("eligible");
    expect(exact.exclusionReasons).not.toContain("experience_conflict");
  });

  it("accepts junior candidates for junior roles with no numeric minimum", () => {
    const result = evaluateJobQuality(
      job({
        title: "Junior E-commerce Manager",
        requiredExperienceYearsMin: null,
        requiredExperienceYearsMax: null,
      }),
      { ...profile, yearsOfExperience: 0, seniority: "entry" },
    );
    expect(result.outcome).toBe("eligible");
    expect(result.exclusionReasons).not.toContain("experience_conflict");
  });

  it("keeps unknown experience requirements eligible", () => {
    const result = evaluateJobQuality(
      job({
        requirementsText: null,
        requiredExperienceYearsMin: null,
        requiredExperienceYearsMax: null,
      }),
      { ...profile, yearsOfExperience: 0 },
    );
    expect(result.outcome).toBe("eligible");
    expect(result.exclusionReasons).not.toContain("experience_conflict");
  });

  it("ranks work preferences without treating them as hard exclusions", () => {
    const focusedProfile = {
      ...profile,
      workArrangements: ["hybrid" as const],
      employmentTypes: ["full-time" as const],
    };
    const matching = evaluateJobQuality(job(), focusedProfile);
    const stretch = evaluateJobQuality(
      job({ workArrangement: "onsite", employmentType: "part-time" }),
      focusedProfile,
    );
    expect(stretch.relevanceScore).toBeLessThan(matching.relevanceScore);
    expect(stretch.outcome).toBe("eligible");
    expect(stretch.exclusionReasons).not.toEqual(
      expect.arrayContaining([
        "work_arrangement_conflict",
        "employment_type_conflict",
      ]),
    );
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
