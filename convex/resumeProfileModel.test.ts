import { describe, expect, it } from "vitest";
import {
  normalizeResumeExtraction,
  normalizeSkill,
  resumeExtractionSchema,
} from "./resumeProfileModel";

function extraction() {
  return resumeExtractionSchema.parse({
    currentTitle: "E-commerce Manager",
    normalizedCurrentTitle: "E-commerce Manager",
    professionalDomain: "E-commerce",
    seniority: "mid",
    summary: "E-commerce professional with website operations experience.",
    roles: [
      {
        jobTitle: "Website Manager",
        normalizedTitle: "Website Manager",
        company: "Store A",
        startDate: "2020-01",
        endDate: "2022-12",
        current: false,
        responsibilities: ["Managed product catalog"],
        achievements: [],
        technologies: ["shopify", "Shopify", "Woo-commerce"],
        domain: "E-commerce",
        dateConfidence: "high",
      },
      {
        jobTitle: "E-commerce Manager",
        normalizedTitle: "E-commerce Manager",
        company: "Store B",
        startDate: "2022-01",
        endDate: "2024-12",
        current: false,
        responsibilities: [],
        achievements: ["Improved conversion by 12%"],
        technologies: ["Shopify Plus", "HTML", "CSS"],
        domain: "E-commerce",
        dateConfidence: "high",
      },
    ],
    skills: {
      technical: ["HTML", "CSS"],
      platforms: ["shopify", "Shopify Plus", "WooCommerce"],
      tools: [],
      business: ["Supplier management"],
      ecommerce: ["Product catalog management"],
      productProject: [],
      marketingDigital: [],
      management: [],
    },
    academicDegreeStatus: "none",
    education: [],
    languages: [{ language: "Hebrew", proficiency: null }],
    location: {
      city: "Rishon LeZion",
      country: "Israel",
      raw: "Rishon LeZion, Israel",
    },
    targetRoles: [
      {
        title: "E-commerce Manager",
        reason: "Recent role",
        confidence: "high",
      },
      { title: "Website Manager", reason: "Prior role", confidence: "high" },
    ],
    confidence: {
      currentTitle: "high",
      location: "high",
      dates: "high",
      targetRoles: "high",
    },
  });
}

describe("resume profile normalization", () => {
  it("deduplicates cosmetic skill variants without collapsing distinct products", () => {
    expect(normalizeSkill(" shopify ")).toBe("Shopify");
    expect(normalizeSkill("Shopify Plus")).toBe("Shopify Plus");
    const normalized = normalizeResumeExtraction(
      extraction(),
      new Date("2026-01-01T00:00:00Z"),
    );
    expect(
      normalized.allSkills.filter((skill) => skill === "Shopify"),
    ).toHaveLength(1);
    expect(normalized.allSkills).toContain("Shopify Plus");
  });

  it("does not double count overlapping employment dates and resolves Israeli locations", () => {
    const normalized = normalizeResumeExtraction(
      extraction(),
      new Date("2026-01-01T00:00:00Z"),
    );
    expect(normalized.totalExperienceMonths).toBe(60);
    expect(normalized.normalizedLocation).toMatchObject({
      placeId: "geonames:293703",
      countryCode: "IL",
    });
  });

  it("keeps a missing location missing", () => {
    const input = extraction();
    input.location = null;
    expect(normalizeResumeExtraction(input).normalizedLocation).toBeNull();
  });
});

describe("qualification evidence", () => {
  it("uses an empty education list when no education is in the CV", () => {
    expect(normalizeResumeExtraction(extraction()).qualifications).toEqual({
      academicDegreeStatus: "none",
      education: [],
    });
  });
  it("distinguishes completed degrees, ongoing study, and practical diplomas", () => {
    const input = extraction();
    input.education = [
      {
        institution: "College",
        field: "Software",
        credential: "Practical engineer",
        level: "diploma",
        status: "completed",
        startDate: "2020",
        endDate: "2022",
      },
      {
        institution: "University",
        field: "Computer Science",
        credential: "B.Sc.",
        level: "bachelor",
        status: "in_progress",
        startDate: "2024",
        endDate: null,
      },
    ];
    expect(
      normalizeResumeExtraction(input).qualifications.academicDegreeStatus,
    ).toBe("none");
    input.education[1].status = "completed";
    expect(
      normalizeResumeExtraction(input).qualifications.academicDegreeStatus,
    ).toBe("completed");
  });
  it("derives no completed degree from ongoing studies", () => {
    const input = extraction();
    input.education = [
      {
        institution: "University",
        field: null,
        credential: "B.Sc.",
        level: "bachelor",
        status: "in_progress",
        startDate: null,
        endDate: null,
      },
    ];
    expect(
      normalizeResumeExtraction(input).qualifications.academicDegreeStatus,
    ).toBe("none");
  });
  it("merges overlapping domain experience rather than inflating it", () => {
    expect(normalizeResumeExtraction(extraction()).experienceByDomain).toEqual([
      { domain: "e commerce", months: 60 },
    ]);
  });
});

it("does not count future employment as earned experience", () => {
  const input = extraction();
  input.roles[0].startDate = "2025-01";
  input.roles[0].endDate = "2029-12";
  input.roles[1].startDate = "2027-01";
  input.roles[1].endDate = "2029-12";
  const result = normalizeResumeExtraction(
    input,
    new Date("2025-12-01T00:00:00Z"),
  );
  expect(result.totalExperienceMonths).toBe(12);
  expect(result.experienceByDomain[0].months).toBe(12);
  expect(result.roles[1].durationMonths).toBeNull();
});

it("keeps incomplete employment dates unknown instead of proving zero experience", () => {
  const input = extraction();
  input.roles.forEach((role) => {
    role.startDate = null;
    role.endDate = null;
  });
  expect(normalizeResumeExtraction(input)).toMatchObject({
    totalExperienceMonths: 0,
    experienceEvidence: "unknown",
  });
  expect(normalizeResumeExtraction(extraction()).experienceEvidence).toBe(
    "known",
  );
});
