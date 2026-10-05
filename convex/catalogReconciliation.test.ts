/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { loadIdentityCatalog } from "./referenceIdentity";
import { upsertSkillCatalogItem } from "./skillIdentity";
const modules = import.meta.glob("./**/*.ts");
afterEach(() => vi.useRealTimers());

it("consolidates late-publication aliases across profiles and every resume, preserving distinct skills and private data", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", { email: "owner@example.com" }),
  );
  const otherId = await t.run((ctx) =>
    ctx.db.insert("users", { email: "other@example.com" }),
  );
  const user = t.withIdentity({ subject: `${userId}|test` });
  const ids = await t.run(async (ctx) => {
    const names = [
      "React",
      "ReactJS",
      "React Native",
      "Java",
      "JavaScript",
      "C",
      "C#",
      "C++",
      "My private tool",
    ];
    const ids = await Promise.all(
      names.map((name) => upsertSkillCatalogItem(ctx, userId, name)),
    );
    return ids.filter((id): id is NonNullable<typeof id> => !!id);
  });
  const otherPrivate = await t.run((ctx) =>
    upsertSkillCatalogItem(ctx, otherId, "Other private tool"),
  );
  const profileId = await t.run((ctx) =>
    ctx.db.insert("candidateProfiles", {
      userId,
      email: "owner@example.com",
      onboardingStep: 2,
      onboardingCompleted: false,
      skillIds: ids,
      createdAt: 1,
      updatedAt: 2,
      professionalSummary: "Keep this",
    }),
  );
  const resumeIds = await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob(["CV"]));
    const result = [];
    // Include more than one page and more than the usual library limit.
    for (let i = 0; i < 31; i++)
      result.push(
        await ctx.db.insert("resumeDocuments", {
          userId,
          storageId,
          fileName: "cv.pdf",
          mimeType: "application/pdf",
          size: 2,
          status: "ready",
          skillIds: ids,
          extractedText: "Keep full text",
          createdAt: i,
          updatedAt: i,
        }),
      );
    return result;
  });
  await t.mutation(internal.referenceData.seedCatalog, {});
  const search = await user.query(api.referenceData.searchCatalog, {
    kind: "skill",
    search: "React",
  });
  expect(search.filter((item) => item.labelEn === "React")).toHaveLength(1);
  expect(search.find((item) => item.labelEn === "React")?.isCustom).toBe(false);
  expect(search.some((item) => item.labelEn === "React Native")).toBe(true);
  const skill = search.find((item) => item.labelEn === "React")!;
  await user.mutation(api.candidateProfiles.saveCurrent, {
    values: { skillIds: [ids[0], skill.id, ids[1], ids[2]] },
    onboardingStep: 2,
    complete: false,
  });
  const saved = await t.run((ctx) =>
    ctx.db.get("candidateProfiles", profileId),
  );
  expect(saved!.skillIds).toHaveLength(2);
  expect(saved!.skillIds![0]).toBe(skill.id);
  const expectedRevision = saved!.updatedAt;
  let phase: "profiles" | "resumes" | "private" | null = "profiles";
  let cursor: string | null = null;
  while (phase) {
    const page: {
      nextPhase: "profiles" | "resumes" | "private" | null;
      nextCursor: string | null;
    } = await t.mutation(internal.catalogReconciliation.reconcilePage, {
      phase,
      cursor,
      scheduleNext: false,
    });
    phase = page.nextPhase;
    cursor = page.nextCursor;
  }
  const profile = await t.run((ctx) =>
    ctx.db.get("candidateProfiles", profileId),
  );
  expect(profile).toMatchObject({
    professionalSummary: "Keep this",
    updatedAt: expectedRevision,
  });
  const labels = await t.run(async (ctx) => {
    const resume = await ctx.db.get("resumeDocuments", resumeIds[30]);
    expect(resume?.extractedText).toBe("Keep full text");
    return Promise.all(
      resume!.skillIds!.map((id) => ctx.db.get("catalogItems", id)),
    );
  });
  expect(labels.map((item) => item?.labelEn)).toEqual([
    "React",
    "React Native",
    "Java",
    "JavaScript",
    "C",
    "C#",
    "C++",
    "My private tool",
  ]);
  for (const id of resumeIds) {
    expect(
      (await t.run((ctx) => ctx.db.get("resumeDocuments", id)))!.skillIds,
    ).toHaveLength(8);
  }
  expect(await t.run((ctx) => ctx.db.get("catalogItems", ids[0]))).toBeNull();
  expect(
    await t.run((ctx) => ctx.db.get("catalogItems", ids[8])),
  ).not.toBeNull();
  expect(
    await t.run((ctx) => ctx.db.get("catalogItems", otherPrivate!)),
  ).not.toBeNull();
  expect(
    await user.query(api.referenceData.searchCatalog, {
      kind: "skill",
      search: "Other private tool",
    }),
  ).not.toContainEqual(expect.objectContaining({ id: otherPrivate }));
  await t.run(loadIdentityCatalog); // Expanded aliases stay inside the runtime catalog budget.
  expect(
    await t.mutation(internal.catalogReconciliation.reconcilePage, {
      phase: "profiles",
      cursor: null,
      scheduleNext: false,
    }),
  ).toMatchObject({ replaced: 0, removed: 0 });
});

it("automatically reconciles existing selections when the shared seed is published", async () => {
  vi.useFakeTimers();
  try {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { email: "auto@example.com" }),
    );
    const skillId = await t.run((ctx) =>
      upsertSkillCatalogItem(ctx, userId, "Cloudflare"),
    );
    const profileId = await t.run((ctx) =>
      ctx.db.insert("candidateProfiles", {
        userId,
        email: "auto@example.com",
        skillIds: [skillId!],
        onboardingStep: 1,
        onboardingCompleted: false,
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    await t.mutation(internal.referenceData.seedCatalog, {});
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const profile = await t.run((ctx) =>
      ctx.db.get("candidateProfiles", profileId),
    );
    const item = await t.run((ctx) =>
      ctx.db.get("catalogItems", profile!.skillIds![0]),
    );
    expect(item).toMatchObject({ labelEn: "Cloudflare", visibility: "public" });
    expect(
      await t.run((ctx) => ctx.db.get("catalogItems", skillId!)),
    ).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

it("consolidates late-publication job titles and classifies exact bilingual experience areas", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", { email: "areas@example.com" }),
  );
  const user = t.withIdentity({ subject: `${userId}|test` });
  const title = await user.mutation(api.referenceData.addCustomCatalogItem, {
    kind: "jobTitle",
    label: "Sales Representative",
    locale: "en",
  });
  const domain = await user.mutation(api.referenceData.addCustomCatalogItem, {
    kind: "experienceDomain",
    label: "Agriculture",
    locale: "en",
  });
  const profileId = await t.run((ctx) =>
    ctx.db.insert("candidateProfiles", {
      userId,
      email: "areas@example.com",
      targetJobTitleIds: [title.id],
      experienceDomains: ["Agriculture"],
      onboardingStep: 1,
      onboardingCompleted: false,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  await t.mutation(internal.referenceData.seedCatalog, {});
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  const profile = await t.run((ctx) =>
    ctx.db.get("candidateProfiles", profileId),
  );
  const sharedTitle = await t.run((ctx) =>
    ctx.db.get("catalogItems", profile!.targetJobTitleIds![0]),
  );
  expect(sharedTitle).toMatchObject({
    labelEn: "Sales Representative",
    visibility: "public",
  });
  expect(profile!.experienceDomains).toEqual(["Agriculture"]);
  expect(
    await t.run((ctx) => ctx.db.get("catalogItems", domain.id)),
  ).toBeNull();
  expect(
    await user.query(api.referenceData.classifyExperienceDomains, {
      labels: ["Agriculture", "חקלאות", "A personal area"],
    }),
  ).toEqual([
    { label: "Agriculture", isCustom: false },
    { label: "חקלאות", isCustom: false },
    { label: "A personal area", isCustom: true },
  ]);
  await expect(
    t.query(api.referenceData.classifyExperienceDomains, {
      labels: ["Agriculture"],
    }),
  ).rejects.toThrow();
});

it("reuses an approved public skill and retains its learned aliases when it enters the bootstrap catalog", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const publicId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("catalogItems", {
      kind: "skill",
      labelEn: "Redis",
      labelHe: "Redis",
      aliases: ["Redis server"],
      normalizedKey: "redis",
      normalizedLabels: ["redis", "redis server"],
      conceptKey: "skill:learned-redis",
      searchText: "Redis Redis server",
      visibility: "public",
      source: "curated",
      externalId: "learned:redis",
      priority: 0,
      active: true,
      createdAt: 1,
      updatedAt: 1,
    });
    for (const normalizedTerm of ["redis", "redis server"])
      await ctx.db.insert("catalogSkillAliases", {
        normalizedTerm,
        conceptKey: "skill:learned-redis",
        catalogItemId: id,
      });
    return id;
  });
  await t.mutation(internal.referenceData.seedCatalog, {});
  const item = await t.run((ctx) => ctx.db.get("catalogItems", publicId));
  expect(item).toMatchObject({
    conceptKey: "skill:redis",
    aliases: ["Redis server"],
  });
  const alias = await t.run((ctx) =>
    ctx.db
      .query("catalogSkillAliases")
      .withIndex("by_normalizedTerm", (q) =>
        q.eq("normalizedTerm", "redis server"),
      )
      .unique(),
  );
  expect(alias).toMatchObject({
    conceptKey: "skill:redis",
    catalogItemId: publicId,
  });
  const rows = await t.run((ctx) =>
    ctx.db
      .query("catalogItems")
      .withIndex("by_source_and_externalId", (q) =>
        q.eq("source", "curated").eq("externalId", "redis"),
      )
      .take(2),
  );
  expect(rows).toHaveLength(1);
});

it("does not skip private duplicates when cleanup deletes across pagination boundaries", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const fixtures = await t.run(async (ctx) => {
    const result = [];
    for (let i = 0; i < 23; i++) {
      const userId = await ctx.db.insert("users", {
        email: `pagination-${i}@example.com`,
      });
      const skillId = await upsertSkillCatalogItem(ctx, userId, "React");
      const profileId = await ctx.db.insert("candidateProfiles", {
        userId,
        email: `pagination-${i}@example.com`,
        skillIds: [skillId!],
        onboardingStep: 1,
        onboardingCompleted: false,
        createdAt: 1,
        updatedAt: 1,
      });
      result.push({ skillId: skillId!, profileId });
    }
    return result;
  });
  await t.mutation(internal.referenceData.seedCatalog, {});
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  for (const { skillId, profileId } of fixtures) {
    const profile = await t.run((ctx) =>
      ctx.db.get("candidateProfiles", profileId),
    );
    const skill = await t.run((ctx) =>
      ctx.db.get("catalogItems", profile!.skillIds![0]),
    );
    expect(skill).toMatchObject({ labelEn: "React", visibility: "public" });
    expect(
      await t.run((ctx) => ctx.db.get("catalogItems", skillId)),
    ).toBeNull();
  }
});
