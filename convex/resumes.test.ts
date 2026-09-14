/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function asUser(t: TestConvex<typeof schema>, userId: Id<"users">) {
  return t.withIdentity({
    subject: `${userId}|test`,
    issuer: "https://test.example",
    tokenIdentifier: `https://test.example|${userId}`,
  });
}

async function seedUserAndResume(
  t: TestConvex<typeof schema>,
  name = "Candidate",
) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "candidate@example.com",
      name,
    });
    const storageId = await ctx.storage.store(
      new Blob(["fixture"], { type: "application/pdf" }),
    );
    const now = Date.now();
    const resumeId = await ctx.db.insert("resumeDocuments", {
      userId,
      storageId,
      fileName: "resume.pdf",
      mimeType: "application/pdf",
      size: 7,
      status: "processing",
      createdAt: now,
      updatedAt: now,
    });
    return { userId, resumeId };
  });
}

const rishon = {
  placeId: "geonames:293703",
  formattedAddress: "Rishon LeZion",
  city: "Rishon LeZion",
  country: "Israel",
  countryCode: "IL",
  latitude: 31.97102,
  longitude: 34.78939,
  radiusKm: 25,
};
const telAviv = {
  placeId: "geonames:293397",
  formattedAddress: "Tel Aviv",
  city: "Tel Aviv",
  country: "Israel",
  countryCode: "IL",
  latitude: 32.08088,
  longitude: 34.78057,
  radiusKm: 25,
};

function completion(
  resumeId: Id<"resumeDocuments">,
  userId: Id<"users">,
  location: typeof rishon | null = rishon,
) {
  return {
    resumeId,
    userId,
    extractedText:
      "Actual CV text with sufficient professional history and dates.",
    structuredProfileJson: '{"validated":true}',
    currentTitle: "E-commerce Manager",
    professionalDomain: "E-commerce",
    seniority: "mid" as const,
    summary:
      "E-commerce manager with several years of website operations and product catalog experience.",
    targetRoles: [
      "E-commerce Manager",
      "Website Manager",
      "E-commerce Operations Manager",
    ],
    skills: ["Shopify", "WooCommerce", "HTML", "CSS"],
    normalizedLocation: location,
    totalExperienceMonths: 60,
    normalizedPastRoles: ["Website Manager", "E-commerce Manager"],
    domains: ["E-commerce"],
    experienceByDomain: [{ domain: "e-commerce", months: 60 }],
    languages: [],
    confidence: {
      currentTitle: "high",
      location: location ? "high" : "low",
      dates: "high",
      targetRoles: "high",
    },
  };
}

describe("CV-derived effective profiles", () => {
  it("creates a usable profile and exposes it to job search after lightweight review", async () => {
    const t = convexTest(schema, modules);
    const { userId, resumeId } = await seedUserAndResume(t);
    await t.mutation(
      internal.resumes.completeProcessing,
      completion(resumeId, userId),
    );
    const user = asUser(t, userId);
    const resume = await user.query(api.resumes.getCurrent);
    expect(resume).toMatchObject({
      status: "ready",
      currentTitle: "E-commerce Manager",
      needsLocation: false,
    });
    expect(resume?.targetRoles).toHaveLength(3);
    expect(resume?.skills.map((skill) => skill.labelEn)).toEqual(
      expect.arrayContaining(["Shopify", "WooCommerce"]),
    );
    expect(
      (await user.query(api.candidateProfiles.getCurrent)).profile,
    ).toMatchObject({
      onboardingCompleted: false,
      onboardingStep: 1,
      cvReviewPending: true,
    });
    await user.mutation(api.resumes.finishReview, {
      targetJobTitleIds: resume!.targetRoles.map((role) => role.id),
      location: {
        ...rishon,
        administrativeArea: "Central District",
      },
    });
    const effective = await t.query(
      internal.jobDiscovery.getCurrentSearchProfile,
      { userId },
    );
    expect(effective.targetJobTitles).toEqual(
      expect.arrayContaining(["E-commerce Manager", "Website Manager"]),
    );
    expect(effective.location.city).toBe("Rishon LeZion");
    expect(effective.location.administrativeArea).toBe("Central District");
    expect(
      (await user.query(api.resumes.getCurrent))?.location?.administrativeArea,
    ).toBe("Central District");
    expect(
      (await user.query(api.candidateProfiles.getCurrent)).profile,
    ).toMatchObject({ onboardingCompleted: true, cvReviewPending: false });
  });

  it("preserves a user-corrected location when a replacement CV says something else", async () => {
    const t = convexTest(schema, modules);
    const first = await seedUserAndResume(t);
    await t.mutation(
      internal.resumes.completeProcessing,
      completion(first.resumeId, first.userId),
    );
    const user = asUser(t, first.userId);
    const firstResume = await user.query(api.resumes.getCurrent);
    await user.mutation(api.resumes.finishReview, {
      targetJobTitleIds: firstResume!.targetRoles.map((role) => role.id),
    });
    await user.mutation(api.candidateProfiles.saveCurrent, {
      values: {
        primaryLocation: telAviv,
        preferredPlaceIds: [telAviv.placeId],
        locationRadiusKm: 25,
      },
      onboardingStep: 4,
      complete: false,
    });
    const second = await t.run(async (ctx) => {
      const storageId = await ctx.storage.store(
        new Blob(["new fixture"], { type: "application/pdf" }),
      );
      const now = Date.now();
      return await ctx.db.insert("resumeDocuments", {
        userId: first.userId,
        storageId,
        fileName: "new.pdf",
        mimeType: "application/pdf",
        size: 11,
        status: "processing",
        createdAt: now + 1,
        updatedAt: now + 1,
      });
    });
    await t.mutation(
      internal.resumes.completeProcessing,
      completion(second, first.userId, rishon),
    );
    const profile = (await user.query(api.candidateProfiles.getCurrent))
      .profile;
    expect(profile?.primaryLocation?.city).toBe("Tel Aviv");
    expect(profile?.manualOverrideFields).toContain("location");
    expect((await user.query(api.resumes.getCurrent))?.location?.city).toBe(
      "Tel Aviv",
    );
  });

  it("stores a second resume independently and switches the effective CV without losing manual location", async () => {
    const t = convexTest(schema, modules);
    const first = await seedUserAndResume(t);
    await t.mutation(
      internal.resumes.completeProcessing,
      completion(first.resumeId, first.userId),
    );
    const user = asUser(t, first.userId);
    await user.mutation(api.candidateProfiles.saveCurrent, {
      values: {
        primaryLocation: telAviv,
        preferredPlaceIds: [telAviv.placeId],
        locationRadiusKm: 25,
      },
      onboardingStep: 4,
      complete: false,
    });
    const second = await t.run(async (ctx) => {
      const storageId = await ctx.storage.store(
        new Blob(["second fixture"], { type: "application/pdf" }),
      );
      const now = Date.now();
      return await ctx.db.insert("resumeDocuments", {
        userId: first.userId,
        storageId,
        fileName: "product.pdf",
        displayName: "Product",
        note: "Product roles",
        mimeType: "application/pdf",
        size: 14,
        status: "processing",
        createdAt: now + 1,
        updatedAt: now + 1,
      });
    });
    await t.mutation(internal.resumes.completeProcessing, {
      ...completion(second, first.userId, rishon),
      currentTitle: "Product Manager",
      targetRoles: ["Product Manager"],
      skills: ["Product Strategy", "Analytics"],
      normalizedPastRoles: ["Product Manager"],
      domains: ["Product"],
      experienceByDomain: [{ domain: "product", months: 48 }],
    });
    const library = await user.query(api.resumes.listMine);
    expect(library).toHaveLength(2);
    expect(library.find((item) => item.id === first.resumeId)?.isActive).toBe(
      true,
    );
    expect(library.find((item) => item.id === second)?.displayName).toBe(
      "Product",
    );
    await user.mutation(api.resumes.setActive, { resumeId: second });
    const current = await user.query(api.resumes.getCurrent);
    expect(current?.currentTitle).toBe("Product Manager");
    expect(current?.location?.city).toBe("Tel Aviv");
    expect(
      (await user.query(api.candidateProfiles.getCurrent)).profile
        ?.manualOverrideFields,
    ).toContain("location");
  });

  it("edits metadata and safely deletes inactive and active resumes", async () => {
    const t = convexTest(schema, modules);
    const first = await seedUserAndResume(t);
    await t.mutation(
      internal.resumes.completeProcessing,
      completion(first.resumeId, first.userId),
    );
    const user = asUser(t, first.userId);
    const second = await t.run(async (ctx) => {
      const storageId = await ctx.storage.store(
        new Blob(["second fixture"], { type: "application/pdf" }),
      );
      const now = Date.now();
      return await ctx.db.insert("resumeDocuments", {
        userId: first.userId,
        storageId,
        fileName: "second.pdf",
        mimeType: "application/pdf",
        size: 14,
        status: "processing",
        createdAt: now + 1,
        updatedAt: now + 1,
      });
    });
    await t.mutation(
      internal.resumes.completeProcessing,
      completion(second, first.userId),
    );
    await user.mutation(api.resumes.updateMetadata, {
      resumeId: second,
      displayName: "E-commerce",
      note: "Management version",
    });
    expect(
      (await user.query(api.resumes.listMine)).find(
        (item) => item.id === second,
      ),
    ).toMatchObject({ displayName: "E-commerce", note: "Management version" });
    await user.mutation(api.resumes.deleteResume, { resumeId: second });
    expect(await user.query(api.resumes.listMine)).toHaveLength(1);
    expect((await user.query(api.resumes.getCurrent))?.id).toBe(first.resumeId);
    const profileBeforeSourceDeletion = (
      await user.query(api.candidateProfiles.getCurrent)
    ).profile;
    await user.mutation(api.resumes.deleteResume, { resumeId: first.resumeId });
    expect(await user.query(api.resumes.listMine)).toHaveLength(0);
    const profileAfterSourceDeletion = (
      await user.query(api.candidateProfiles.getCurrent)
    ).profile;
    expect(profileAfterSourceDeletion?.activeResumeId).toBeUndefined();
    expect(profileAfterSourceDeletion).toMatchObject({
      targetJobTitleIds: profileBeforeSourceDeletion?.targetJobTitleIds,
      skillIds: profileBeforeSourceDeletion?.skillIds,
      professionalSummary: profileBeforeSourceDeletion?.professionalSummary,
      cvCareerProfile: profileBeforeSourceDeletion?.cvCareerProfile,
    });
  });

  it("replaces a resume file without losing its label or leaving the old record", async () => {
    const t = convexTest(schema, modules);
    const first = await seedUserAndResume(t);
    await t.mutation(
      internal.resumes.completeProcessing,
      completion(first.resumeId, first.userId),
    );
    const user = asUser(t, first.userId);
    await user.mutation(api.resumes.updateMetadata, {
      resumeId: first.resumeId,
      displayName: "Main CV",
      note: "Primary version",
    });
    const storageId = await t.run((ctx) =>
      ctx.storage.store(
        new Blob(["replacement fixture"], { type: "application/pdf" }),
      ),
    );
    const replacementId = await user.mutation(api.resumes.createFromUpload, {
      storageId,
      fileName: "replacement.pdf",
      mimeType: "application/pdf",
      size: 19,
      replacementForId: first.resumeId,
    });
    await t.mutation(
      internal.resumes.completeProcessing,
      completion(replacementId, first.userId),
    );
    expect(
      await t.run((ctx) => ctx.db.get("resumeDocuments", first.resumeId)),
    ).toBeNull();
    expect(await user.query(api.resumes.listMine)).toEqual([
      expect.objectContaining({
        id: replacementId,
        displayName: "Main CV",
        note: "Primary version",
        isActive: true,
      }),
    ]);
  });

  it("does not invent a location or complete a broken profile", async () => {
    const t = convexTest(schema, modules);
    const { userId, resumeId } = await seedUserAndResume(t);
    await t.mutation(
      internal.resumes.completeProcessing,
      completion(resumeId, userId, null),
    );
    const user = asUser(t, userId);
    expect(await user.query(api.resumes.getCurrent)).toMatchObject({
      status: "needs_confirmation",
      needsLocation: true,
    });
    expect(
      (await user.query(api.candidateProfiles.getCurrent)).profile,
    ).toMatchObject({ onboardingCompleted: false, cvReviewPending: true });
  });

  it("rejects unsupported uploads and unauthenticated reads", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.resumes.getCurrent)).rejects.toThrow();
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { email: "candidate@example.com" }),
    );
    const storageId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["plain"], { type: "text/plain" })),
    );
    await expect(
      asUser(t, userId).mutation(api.resumes.createFromUpload, {
        storageId,
        fileName: "resume.txt",
        mimeType: "text/plain",
        size: 5,
      }),
    ).rejects.toThrow();

    const genericMimeStorageId = await t.run((ctx) =>
      ctx.storage.store(
        new Blob(["%PDF-1.4 fixture"], {
          type: "application/octet-stream",
        }),
      ),
    );
    await expect(
      asUser(t, userId).mutation(api.resumes.createFromUpload, {
        storageId: genericMimeStorageId,
        fileName: "resume.pdf",
        mimeType: "application/octet-stream",
        size: 16,
      }),
    ).resolves.toBeTruthy();
  });

  it("fails safely when structured extraction has no usable roles or skills", async () => {
    const t = convexTest(schema, modules);
    const { userId, resumeId } = await seedUserAndResume(t);
    await expect(
      t.mutation(internal.resumes.completeProcessing, {
        ...completion(resumeId, userId),
        targetRoles: [],
        skills: [],
      }),
    ).rejects.toThrow();
    await t.mutation(internal.resumes.failProcessing, {
      resumeId,
      userId,
      failureCode: "INSUFFICIENT_RESUME_DATA",
    });
    const user = asUser(t, userId);
    expect(await user.query(api.resumes.getCurrent)).toMatchObject({
      status: "failed",
      failureCode: "INSUFFICIENT_RESUME_DATA",
    });
    expect(
      (await user.query(api.candidateProfiles.getCurrent)).profile,
    ).toBeNull();
  });
});
