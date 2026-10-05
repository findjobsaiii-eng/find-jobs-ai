/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import {
  loadIdentityCatalog,
  observeReferenceTerms,
} from "./referenceIdentity";
import { skillsEquivalent } from "./skillIdentity";
import {
  fieldKeysFromCatalog,
  educationObservationTerms,
} from "./referenceIdentityModel";
import { evaluateRequirements } from "./jobRequirements";
import type { SearchProfile } from "./jobDiscoveryModel";
const modules = import.meta.glob("./**/*.ts");
async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.referenceData.seedCatalog, {});
  return t;
}
async function frequent(
  t: Awaited<ReturnType<typeof setup>>,
  kind: "skill" | "education",
  term: string,
) {
  await t.run(async (ctx) => {
    for (let i = 0; i < 3; i++)
      await observeReferenceTerms(ctx, { key: `job:independent-${i}` }, [
        { kind, term },
      ]);
  });
  return (
    await t.run((ctx) =>
      ctx.db
        .query("catalogTermCandidates")
        .withIndex("by_kind_and_normalizedTerm")
        .take(10),
    )
  )[0];
}
const usage = { model: "test-model", inputTokens: 100, outputTokens: 20 };

describe("database career identities", () => {
  it("counts independent sources, ignoring duplicate uploads and rediscovery", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "one@example.com" });
      for (let i = 0; i < 4; i++)
        await observeReferenceTerms(ctx, { key: `user:${userId}`, userId }, [
          { kind: "skill", term: "Novel Framework" },
        ]);
      await observeReferenceTerms(ctx, { key: "job:one" }, [
        { kind: "skill", term: "Novel Framework" },
      ]);
      await observeReferenceTerms(ctx, { key: "job:one" }, [
        { kind: "skill", term: "Novel Framework" },
      ]);
    });
    const rows = await t.run((ctx) =>
      ctx.db
        .query("catalogTermCandidates")
        .withIndex("by_kind_and_normalizedTerm")
        .take(5),
    );
    expect(rows[0].occurrenceCount).toBe(2);
    expect(
      await t.mutation(internal.referenceIdentity.claimMonthlyBatch, {
        period: "2026-11",
      }),
    ).toBeNull();
  });
  it("claims a bounded batch only once per month", async () => {
    const t = await setup();
    await frequent(t, "skill", "Novel Framework");
    const batch = await t.mutation(
      internal.referenceIdentity.claimMonthlyBatch,
      { period: "2026-11" },
    );
    expect(batch?.candidates).toHaveLength(1);
    expect(
      await t.mutation(internal.referenceIdentity.claimMonthlyBatch, {
        period: "2026-11",
      }),
    ).toBeNull();
    await t.mutation(internal.referenceIdentity.failMonthlyBatch, {
      runId: batch!.runId,
      error: "Provider unavailable",
    });
    expect(
      await t.mutation(internal.referenceIdentity.claimMonthlyBatch, {
        period: "2026-11",
      }),
    ).toBeNull();
  });
  it("learns an approved skill alias and survives reseeding", async () => {
    const t = await setup();
    const candidate = await frequent(t, "skill", "Expressing ideas verbally");
    const batch = await t.mutation(
      internal.referenceIdentity.claimMonthlyBatch,
      { period: "2026-11" },
    );
    await t.mutation(internal.referenceIdentity.finishMonthlyBatch, {
      runId: batch!.runId,
      ...usage,
      proposals: [
        {
          id: candidate._id,
          kind: "skill",
          canonicalEn: "Verbal Communication",
          canonicalHe: "כושר ביטוי",
          confidence: 0.99,
          reason: "Equivalent verbal expression",
          safeToPublish: true,
          equivalent: true,
        },
      ],
    });
    let catalog = await t.run(loadIdentityCatalog);
    expect(skillsEquivalent(candidate.term, "כושר התבטאות", catalog)).toBe(
      true,
    );
    expect(skillsEquivalent(candidate.term, "Public Speaking", catalog)).toBe(
      false,
    );
    await t.mutation(internal.referenceData.seedCatalog, {});
    catalog = await t.run(loadIdentityCatalog);
    expect(skillsEquivalent(candidate.term, "כושר התבטאות", catalog)).toBe(
      true,
    );
    const candidateAfter = await t.run((ctx) =>
      ctx.db.get("catalogTermCandidates", candidate._id),
    );
    expect(candidateAfter?.status).toBe("approved");
  });
  it("adds a new study subject to the DB and matches its bilingual alias with degree level enforced", async () => {
    const t = await setup();
    const candidate = await frequent(t, "education", "מטאורולוגיה");
    const batch = await t.mutation(
      internal.referenceIdentity.claimMonthlyBatch,
      { period: "2026-11" },
    );
    await t.mutation(internal.referenceIdentity.finishMonthlyBatch, {
      runId: batch!.runId,
      ...usage,
      proposals: [
        {
          id: candidate._id,
          kind: "field",
          canonicalEn: "Meteorology",
          canonicalHe: "מטאורולוגיה",
          confidence: 0.99,
          reason: "Conventional scientific subject",
          safeToPublish: true,
          equivalent: true,
        },
      ],
    });
    const identityCatalog = await t.run(loadIdentityCatalog);
    expect(
      fieldKeysFromCatalog(identityCatalog, "Bachelor's degree in Meteorology"),
    ).toEqual(fieldKeysFromCatalog(identityCatalog, "תואר במטאורולוגיה"));
    const profile = {
      identityCatalog,
      skills: [],
      languages: [],
      qualifications: {
        academicDegreeStatus: "completed",
        education: [
          {
            level: "bachelor",
            status: "completed",
            field: null,
            credential: "מטאורולוגיה",
          },
        ],
      },
    } as unknown as SearchProfile;
    const job = {
      requiredSkills: [],
      preferredSkills: [],
      educationRequirements: ["Bachelor's degree in Meteorology required"],
      languages: [],
      requirementsText: null,
    };
    expect(evaluateRequirements(job, profile)[0].status).toBe("met");
    profile.qualifications!.education[0].level = "diploma";
    expect(evaluateRequirements(job, profile)[0].status).toBe("gap");
    expect(fieldKeysFromCatalog(identityCatalog, "CSS")).toEqual([]);
    expect(fieldKeysFromCatalog(identityCatalog, "תואר במדעי המחשב")).toEqual([
      "computer_science",
    ]);
  });
  it("leaves uncertain suggestions for authorized review", async () => {
    const t = await setup();
    const candidate = await frequent(t, "skill", "Ambiguous term");
    const batch = await t.mutation(
      internal.referenceIdentity.claimMonthlyBatch,
      { period: "2026-11" },
    );
    await t.mutation(internal.referenceIdentity.finishMonthlyBatch, {
      runId: batch!.runId,
      ...usage,
      proposals: [
        {
          id: candidate._id,
          kind: "skill",
          canonicalEn: "Some Skill",
          canonicalHe: "מיומנות",
          confidence: 0.8,
          reason: "Uncertain wording",
          safeToPublish: true,
          equivalent: true,
        },
      ],
    });
    expect(
      (await t.run((ctx) => ctx.db.get("catalogTermCandidates", candidate._id)))
        ?.status,
    ).toBe("review");
    await expect(
      t.query(api.referenceIdentity.listReview, {}),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.referenceIdentity.decideCandidate, {
        id: candidate._id,
        approve: true,
      }),
    ).rejects.toThrow();
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { email: "admin@example.com" }),
    );
    await t.run((ctx) =>
      ctx.db.insert("adminMemberships", {
        userId,
        active: true,
        grantedBy: "test",
        role: "admin",
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    const admin = t.withIdentity({ subject: `${userId}|test` });
    expect(
      await admin.mutation(api.referenceIdentity.decideCandidate, {
        id: candidate._id,
        approve: false,
      }),
    ).toBe(true);
    expect(
      (await t.run((ctx) => ctx.db.get("catalogTermCandidates", candidate._id)))
        ?.status,
    ).toBe("rejected");
  });
  it("rolls back a conflicting alias without publishing a stray canonical skill", async () => {
    const t = await setup();
    const id = await t.run((ctx) =>
      ctx.db.insert("catalogTermCandidates", {
        kind: "skill",
        term: "Java",
        normalizedTerm: "java",
        occurrenceCount: 3,
        status: "pending",
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    const batch = await t.mutation(
      internal.referenceIdentity.claimMonthlyBatch,
      { period: "2026-11" },
    );
    await t.mutation(internal.referenceIdentity.finishMonthlyBatch, {
      runId: batch!.runId,
      ...usage,
      proposals: [
        {
          id,
          kind: "skill",
          canonicalEn: "JavaScript",
          canonicalHe: "JavaScript",
          confidence: 1,
          reason: "Bad proposal",
          safeToPublish: true,
          equivalent: true,
        },
      ],
    });
    const catalog = await t.run(loadIdentityCatalog);
    expect(skillsEquivalent("Java", "JavaScript", catalog)).toBe(false);
    expect(
      (await t.run((ctx) => ctx.db.get("catalogTermCandidates", id)))?.status,
    ).toBe("review");
  });
  it("rejects unsafe names and does not count invalid contact details", async () => {
    const t = await setup();
    await t.run((ctx) =>
      observeReferenceTerms(ctx, { key: "job:one" }, [
        { kind: "education", term: "person@example.com" },
      ]),
    );
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("catalogTermCandidates")
          .withIndex("by_kind_and_normalizedTerm")
          .take(1),
      ),
    ).toEqual([]);
    const candidate = await frequent(t, "skill", "Personal name");
    const batch = await t.mutation(
      internal.referenceIdentity.claimMonthlyBatch,
      { period: "2026-11" },
    );
    await t.mutation(internal.referenceIdentity.finishMonthlyBatch, {
      runId: batch!.runId,
      ...usage,
      proposals: [
        {
          id: candidate._id,
          kind: "skill",
          canonicalEn: "Personal name",
          canonicalHe: "שם פרטי",
          confidence: 1,
          reason: "Not generic vocabulary",
          safeToPublish: false,
          equivalent: false,
        },
      ],
    });
    expect(
      (await t.run((ctx) => ctx.db.get("catalogTermCandidates", candidate._id)))
        ?.status,
    ).toBe("rejected");
  });
  it("limits each monthly batch to 30 candidates", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < 35; i++)
        await ctx.db.insert("catalogTermCandidates", {
          kind: "skill",
          term: `Novel term ${i}`,
          normalizedTerm: `novel term ${i}`,
          occurrenceCount: 3,
          status: "pending",
          createdAt: 1,
          updatedAt: 1,
        });
    });
    const batch = await t.mutation(
      internal.referenceIdentity.claimMonthlyBatch,
      { period: "2026-11" },
    );
    expect(batch?.candidates).toHaveLength(30);
  });

  it("removes user-linked occurrences on deletion without losing other sources", async () => {
    const t = await setup();
    const { userId, jobId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "delete@example.com",
      });
      const otherId = await ctx.db.insert("users", {
        email: "keep@example.com",
      });
      for (const id of [userId, otherId])
        await observeReferenceTerms(ctx, { key: `user:${id}`, userId: id }, [
          { kind: "skill", term: "Shared Unfamiliar Skill" },
        ]);
      await observeReferenceTerms(ctx, { key: `user:${userId}`, userId }, [
        { kind: "skill", term: "Only This User" },
      ]);
      const jobId = await ctx.db.insert("accountDeletionJobs", {
        userId,
        stage: 21,
        createdAt: 1,
      });
      return { userId, jobId };
    });
    await t.mutation(internal.accountData.deleteBatch, { jobId });
    const records = await t.run(async (ctx) => ({
      occurrences: await ctx.db
        .query("catalogTermOccurrences")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .take(5),
      candidates: await ctx.db
        .query("catalogTermCandidates")
        .withIndex("by_kind_and_normalizedTerm")
        .take(5),
    }));
    expect(records.occurrences).toEqual([]);
    expect(records.candidates).toHaveLength(1);
    expect(records.candidates[0].term).toBe("Shared Unfamiliar Skill");
    expect(records.candidates[0].occurrenceCount).toBe(1);
  });

  it("extracts compact subjects without equating alternative subjects", () => {
    expect(
      educationObservationTerms([
        "Bachelor's degree in Meteorology required",
        "תואר ראשון בהנדסת אווירונאוטיקה - חובה",
      ]),
    ).toEqual(["Meteorology", "הנדסת אווירונאוטיקה"]);
    expect(
      educationObservationTerms([
        "Degree in Computer Science or Mathematics",
        "An equivalent qualification",
      ]),
    ).toEqual([]);
  });
});

it("returns saved personal education only to its owner and recognizes public bilingual aliases", async () => {
  const t = await setup();
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", { email: "personal@example.com" }),
  );
  const otherId = await t.run((ctx) =>
    ctx.db.insert("users", { email: "other@example.com" }),
  );
  const user = t.withIdentity({ subject: `${userId}|test` });
  await user.mutation(api.candidateProfiles.saveCurrent, {
    values: {
      qualifications: {
        academicDegreeStatus: "none",
        education: [
          {
            level: "certificate",
            status: "completed",
            field: null,
            credential: "Advanced Meteorology Certificate",
          },
          {
            level: "bachelor",
            status: "in_progress",
            field: "CS",
            credential: null,
          },
        ],
      },
    },
    onboardingStep: 3,
    complete: false,
  });
  const found = await user.query(api.referenceIdentity.searchEducation, {
    search: "Meteorology",
  });
  expect(
    found.filter((item) => item.labelEn === "Advanced Meteorology Certificate"),
  ).toHaveLength(1);
  expect(found[0].isCustom).toBe(true);
  const other = t.withIdentity({ subject: `${otherId}|test` });
  expect(
    await other.query(api.referenceIdentity.searchEducation, {
      search: "Meteorology",
    }),
  ).toEqual([]);
  expect(
    await user.query(api.referenceIdentity.searchEducation, { search: "CS" }),
  ).toContainEqual(
    expect.objectContaining({ labelEn: "Computer Science", isCustom: false }),
  );
  await expect(
    t.query(api.referenceIdentity.searchEducation, { search: "" }),
  ).rejects.toThrow();
});

it("bounds education lookup text without rejecting an imported long credential", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", { email: "candidate@example.com" }),
  );
  const user = t.withIdentity({ subject: `${userId}|test-session` });
  const result = await user.query(api.referenceIdentity.searchEducation, {
    search: "Software Engineering ".repeat(30),
  });
  expect(result).toEqual([]);
  await expect(
    t.query(api.referenceIdentity.searchEducation, { search: "a".repeat(200) }),
  ).rejects.toThrow(/UNAUTHENTICATED/u);
});
