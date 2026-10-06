import { describe, expect, it } from "vitest";
import { sourceRequirementPatch } from "./jobRequirementEvidence";
import { evaluateJobQuality } from "./jobQuality";
import {
  buildSearchPlan,
  resolveExperienceRequirement,
  type SearchProfile,
} from "./jobDiscoveryModel";
import { evaluateRequirements } from "./jobRequirements";
import {
  computeOverview,
  computeDecisionMetrics,
  type MetricsRows,
} from "./adminMetricsModel";
import type { Id } from "./_generated/dataModel";

const profile: SearchProfile = {
  targetJobTitles: ["Software Engineer"],
  currentRole: "Lead Full Stack Developer",
  seniority: "senior",
  skills: ["React", "TypeScript", "Node.js"],
  yearsOfExperience: 3,
  location: {
    placeId: "test",
    formattedAddress: "Tel Aviv",
    country: "Israel",
    countryCode: "IL",
    latitude: 32.08,
    longitude: 34.78,
    radiusKm: 40,
  },
  workArrangements: ["hybrid", "onsite"],
  employmentTypes: ["full-time"],
  languages: [
    { languageCode: "en", proficiency: "fluent" },
    { languageCode: "he", proficiency: "native" },
  ],
  minimumMonthlySalaryIls: 0,
};
const job = {
  title: "Software Engineer",
  descriptionText: "Build software",
  requirementsText: null,
  responsibilities: [],
  requiredSkills: ["React"],
  preferredSkills: [],
  educationRequirements: [],
  languages: [],
  requiredExperienceYearsMin: null,
  requiredExperienceYearsMax: null,
  country: "Israel",
  city: "Tel Aviv",
  locationText: "Tel Aviv",
  geo: { latitude: 32.08, longitude: 34.78, countryCode: "IL" },
  workArrangement: "hybrid" as const,
  employmentType: "full-time" as const,
  salaryMax: null,
  salaryCurrency: null,
  salaryPeriod: null,
  requirementsStatus: "complete" as const,
};

describe("production audit regressions", () => {
  it("preserves source experience, Hebrew fluency, clearance, GPA and transcript conditions", () => {
    const patch = sourceRequirementPatch(
      job,
      "What We Value\n4+ years of professional software development experience.\nWhat We Require\nHebrew fluency required.\nSecurity clearance or ability to obtain one.\nApply for this job",
      "ats",
    );
    expect(patch.requiredExperienceYearsMin).toBe(4);
    expect(patch.languages).toContain("Hebrew fluency required.");
    expect(patch.additionalRequirements).toContain(
      "Security clearance or ability to obtain one.",
    );
    expect(
      evaluateJobQuality({ ...job, ...patch }, profile).exclusionReasons,
    ).toContain("experience_conflict");
    const academic = sourceRequirementPatch(
      job,
      "Requirements\nAcademic background from a leading institution.\nMinimum GPA of 85.\nAn academic transcript is required.",
      "ats",
    );
    expect(academic.additionalRequirements.join(" ")).toContain("85");
    expect(
      evaluateJobQuality({ ...job, ...academic }, profile).matchQuality,
    ).not.toBe("strong");
  });
  it("does not claim strong fit from absent or truncated source requirements", () => {
    expect(
      evaluateJobQuality({ ...job, requirementsStatus: undefined }, profile)
        .matchQuality,
    ).not.toBe("strong");
    expect(
      sourceRequirementPatch(
        job,
        "Software Engineer at Example. Apply now.",
        "ats",
      ).requirementsStatus,
    ).toBe("incomplete");
    expect(
      sourceRequirementPatch(
        job,
        "Requirements\nReact experience required.",
        "aggregator",
      ).requirementsStatus,
    ).toBe("incomplete");
  });
  it("uses OR skill alternatives and the existing language evidence", () => {
    const assessments = evaluateRequirements(
      {
        ...job,
        requiredSkills: ["React, Angular, or Vue.js", "English communication"],
        languages: ["Fluent English"],
      },
      profile,
    );
    expect(assessments.slice(0, 2).map((item) => item.status)).toEqual([
      "met",
      "met",
    ]);
    expect(
      evaluateRequirements(
        { ...job, requiredSkills: ["React Native"] },
        profile,
      )[0].status,
    ).toBe("unknown");
  });
  it("keeps mobile-only and career-change preferences primary", () => {
    expect(
      evaluateJobQuality(job, {
        ...profile,
        targetJobTitles: ["Mobile Developer"],
      }).exclusionReasons,
    ).toContain("professional_mismatch");
    expect(
      evaluateJobQuality(job, { ...profile, targetJobTitles: ["Bookkeeper"] })
        .exclusionReasons,
    ).toContain("professional_mismatch");
    expect(
      evaluateJobQuality({ ...job, title: "Security Engineer" }, profile)
        .exclusionReasons,
    ).toContain("professional_mismatch");
  });
  it("ranks a matching level above junior roles for a senior developer", () => {
    expect(
      evaluateJobQuality({ ...job, title: "Senior Software Engineer" }, profile)
        .relevanceScore,
    ).toBeGreaterThan(
      evaluateJobQuality({ ...job, title: "Junior Software Engineer" }, profile)
        .relevanceScore + 10,
    );
  });
  it("shares bilingual cache identities without merging different specialties", () => {
    const fingerprint = (role: string) =>
      buildSearchPlan({ ...profile, targetJobTitles: [role] }).fingerprint;
    expect(fingerprint("Software Engineer")).toBe(
      fingerprint("Software Engineer מהנדס תוכנה"),
    );
    expect(fingerprint("Software Engineer")).toBe(fingerprint("מהנדס תוכנה"));
    expect(fingerprint("Backend Engineer")).not.toBe(
      fingerprint("Frontend Engineer"),
    );
  });
  it("uses the lower edge of an explicit 3–5+ range, not a generated upper-edge minimum", () => {
    expect(
      resolveExperienceRequirement({
        ...job,
        requirementsText: "3–5+ years of bookkeeping experience",
        requiredExperienceYearsMin: 5,
      }).min,
    ).toBe(3);
  });
  it("computes accurate summaries for 10,000 users without the previous scan caps", () => {
    const users = Array.from({ length: 10_000 }, (_, index) => ({
      _id: `user-${index}` as Id<"users">,
      _creationTime: 1000,
    }));
    const rows: MetricsRows = {
      users,
      runs: [],
      audits: [],
      discoveries: [],
      jobs: [],
      matches: [],
      activity: [],
      events: [],
      emailEvents: [],
      adminMemberships: [],
    };
    expect(
      computeOverview(rows, { start: 0, end: 2000, dayKey: "2026-10-06" }),
    ).toMatchObject({ totalUsers: 10_000, newUsers: 10_000, truncated: false });
    expect(computeDecisionMetrics(rows, { now: 2000 }).truncated).toBe(false);
  });
});

it("matches source requirement prose without flattening AND groups or React Native", () => {
  const assess = (value: string, skills: string[]) =>
    evaluateRequirements(
      { ...job, requiredSkills: [value] },
      { ...profile, skills },
    )[0].status;
  expect(
    assess("Knowledge of a front-end framework: React, Angular, or Vue.js", [
      "React",
    ]),
  ).toBe("met");
  expect(
    assess("Extensive experience working with ReactJS TypeScript", [
      "React",
      "TypeScript",
    ]),
  ).toBe("met");
  expect(
    assess("Extensive experience working with ReactJS TypeScript", ["React"]),
  ).toBe("unknown");
  expect(assess("Knowledge of React Native", ["React"])).toBe("unknown");
  expect(assess("React and TypeScript or Vue and Node.js", ["React"])).toBe(
    "unknown",
  );
  expect(
    assess(
      "JavaScript/TypeScript using Node.js frameworks such as NestJS or Express",
      ["JavaScript"],
    ),
  ).toBe("unknown");
  expect(
    assess(
      "JavaScript/TypeScript using Node.js frameworks such as NestJS or Express",
      ["Express"],
    ),
  ).toBe("unknown");
});

it("does not turn an employer founder biography into a candidate experience minimum", () => {
  const requirementsText =
    "Experience with on-page SEO required.\nYou work directly with the founder - 23 years of marketing experience, 12 years of video production.";
  expect(
    resolveExperienceRequirement({
      ...job,
      requirementsText,
      requiredExperienceYearsMin: 23,
    }),
  ).toMatchObject({ min: null });
  expect(
    sourceRequirementPatch(
      { ...job, requiredExperienceYearsMin: 23 },
      requirementsText,
      "employer",
    ),
  ).toMatchObject({ requiredExperienceYearsMin: null });
});

it("retains candidate experience requirements in a company introduction", () => {
  expect(
    resolveExperienceRequirement({
      ...job,
      requirementsText:
        "We have a role for a candidate with 5 years of software development experience.",
    }),
  ).toMatchObject({ min: 5 });
});

it("does not turn general technology knowledge into a certification", () => {
  expect(
    evaluateRequirements(
      { ...job, requiredSkills: ["AWS certification required"] },
      { ...profile, skills: ["AWS"] },
    )[0].status,
  ).toBe("unknown");
});

it("requires every language in an AND condition and honors explicit proficiency per language", () => {
  const assess = (requirement: string, english: "basic" | "fluent") =>
    evaluateRequirements(
      { ...job, languages: [requirement] },
      {
        ...profile,
        languages: [
          { languageCode: "he", proficiency: "native" },
          { languageCode: "en", proficiency: english },
        ],
      },
    ).find((a) => a.requirement === requirement)?.status;
  expect(
    assess("Excellent communication skills in Hebrew and English", "basic"),
  ).toBe("gap");
  expect(assess("Native Hebrew and fluent English", "fluent")).toBe("met");
  expect(assess("Fluent English or Hebrew", "basic")).toBe("met");
  expect(
    assess(
      "Full Professional Proficiency in English and Hebrew language",
      "basic",
    ),
  ).toBe("gap");
});

it("assesses simple skill conditions placed in miscellaneous requirements without proving unrelated criteria", () => {
  const assess = (requirement: string, skills: string[]) =>
    evaluateRequirements(
      {
        ...job,
        requiredSkills: [],
        preferredSkills: [],
        educationRequirements: [],
        languages: [],
        additionalRequirements: [requirement],
      },
      { ...profile, skills },
    ).find((item) => item.requirement === requirement)!.status;
  expect(assess("ניסיון ב-Vue.js או React", ["React"])).toBe("met");
  expect(assess("Knowledge of React and TypeScript.", ["React"])).toBe(
    "unknown",
  );
  expect(
    assess("Knowledge of React and TypeScript.", ["React", "TypeScript"]),
  ).toBe("met");
  expect(assess("React and security-clearance eligibility", ["React"])).toBe(
    "unknown",
  );
  expect(assess("3 years of React experience", ["React"])).toBe("unknown");
  expect(assess("React and TypeScript or Vue and Node.js", ["React"])).toBe(
    "unknown",
  );
});
