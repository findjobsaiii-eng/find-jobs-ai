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
