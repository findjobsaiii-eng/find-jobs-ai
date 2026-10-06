/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

it("includes public and owned experience areas in CV extraction without leaking another user's private area", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.referenceData.seedCatalog, {});
  const [userId, otherId] = await t.run(async (ctx) => [
    await ctx.db.insert("users", { name: "Owner" }),
    await ctx.db.insert("users", { name: "Other" }),
  ]);
  await asUser(t, userId).mutation(api.referenceData.addCustomCatalogItem, {
    kind: "experienceDomain",
    label: "Marine insurance operations",
    locale: "en",
  });
  await asUser(t, otherId).mutation(api.referenceData.addCustomCatalogItem, {
    kind: "experienceDomain",
    label: "Private unrelated area",
    locale: "en",
  });
  const catalog = await t.query(internal.resumes.getCatalogForExtraction, {
    userId,
  });
  expect(catalog).toContainEqual(
    expect.objectContaining({ kind: "experienceDomain", labelEn: "Insurance" }),
  );
  expect(catalog).toContainEqual(
    expect.objectContaining({
      kind: "experienceDomain",
      labelEn: "Marine insurance operations",
    }),
  );
  expect(
    catalog.some((item) => item.labelEn === "Private unrelated area"),
  ).toBe(false);
});

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
    await ctx.db.insert("legalConsents", {
      userId,
      termsVersion: "2026-09-23-draft-2",
      privacyVersion: "2026-09-23-draft-2",
      acceptedAt: Date.now(),
      marketingOptIn: false,
      marketingUpdatedAt: Date.now(),
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
    experienceEvidence: "known" as const,
    normalizedPastRoles: ["Website Manager", "E-commerce Manager"],
    domains: ["E-commerce"],
    experienceByDomain: [{ domain: "e-commerce", months: 60 }],
    qualifications: { academicDegreeStatus: "unknown" as const, education: [] },
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
  it("limits signed upload URLs per user", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedUserAndResume(t);
    const user = asUser(t, userId);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await user.mutation(api.resumes.generateUploadUrl, {});
    }
    await expect(
      user.mutation(api.resumes.generateUploadUrl, {}),
    ).rejects.toThrow();
  });

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

  it("stores a second resume independently and selecting it preserves profile facts", async () => {
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
    const review = await user.query(api.resumes.getCurrent);
    await user.mutation(api.resumes.finishReview, {
      targetJobTitleIds: review!.targetRoles.map((r) => r.id),
    });
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
      updatedAt: profileBeforeSourceDeletion?.updatedAt,
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
    const originalProfile = (await user.query(api.candidateProfiles.getCurrent))
      .profile!;
    await user.mutation(api.candidateProfiles.saveCurrent, {
      values: {
        targetJobTitleIds: originalProfile.targetJobTitleIds!,
        professionalSummary:
          "This manually edited summary belongs only to the old resume data.",
        yearsOfExperience: 17,
        skillIds: originalProfile.skillIds!,
        primaryLocation: telAviv,
        preferredPlaceIds: [telAviv.placeId],
        locationRadiusKm: 25,
        languages: [{ languageCode: "he", proficiency: "native" }],
        workArrangements: ["remote"],
      },
      onboardingStep: 3,
      complete: false,
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
    await t.mutation(internal.resumes.completeProcessing, {
      ...completion(replacementId, first.userId),
      currentTitle: "Product Manager",
      summary:
        "Product manager with deep analytics and product strategy experience.",
      targetRoles: ["Product Manager"],
      skills: ["Product Strategy", "Analytics"],
      normalizedLocation: rishon,
      totalExperienceMonths: 48,
      normalizedPastRoles: ["Product Manager"],
      domains: ["Product"],
      experienceByDomain: [{ domain: "product", months: 48 }],
      languages: [],
    });
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
    const updated = await user.query(api.candidateProfiles.getCurrent);
    expect(updated.profile).toMatchObject({
      professionalSummary:
        "Product manager with deep analytics and product strategy experience.",
      yearsOfExperience: 4,
      primaryLocation: expect.objectContaining({ city: "Rishon LeZion" }),
      languages: [],
      workArrangements: ["remote"],
    });
    expect(updated.selections.targetJobTitles).toEqual([
      expect.objectContaining({ labelEn: "Product Manager" }),
    ]);
    expect(updated.selections.skills).toEqual([
      expect.objectContaining({ labelEn: "Product Strategy" }),
      expect.objectContaining({ labelEn: "Analytics" }),
    ]);
    expect(updated.profile?.manualOverrideFields).not.toEqual(
      expect.arrayContaining([
        "targetJobTitles",
        "professionalSummary",
        "yearsOfExperience",
        "skills",
        "location",
        "languages",
      ]),
    );
    expect(updated.profile?.manualOverrideFields).toContain("workArrangements");
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
    expect(
      await asUser(t, userId).mutation(api.resumes.generateUploadUrl, {}),
    ).toMatch(/^https?:\/\//u);
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
    ).rejects.toThrow();
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

describe("qualification source changes", () => {
  it.each(["none", "completed"] as const)(
    "keeps user-confirmed %s degree status through replacement and resume switching",
    async (academicDegreeStatus) => {
      const t = convexTest(schema, modules);
      const first = await seedUserAndResume(t);
      const user = asUser(t, first.userId);
      const qualifications = {
        academicDegreeStatus,
        education:
          academicDegreeStatus === "completed"
            ? [
                {
                  level: "bachelor" as const,
                  status: "completed" as const,
                  field: "Computer Science",
                  credential: "B.Sc.",
                },
              ]
            : [],
      };
      await user.mutation(api.candidateProfiles.saveCurrent, {
        values: { qualifications },
        onboardingStep: 1,
        complete: false,
      });
      await t.mutation(
        internal.resumes.completeProcessing,
        completion(first.resumeId, first.userId),
      );
      expect(
        (await user.query(api.candidateProfiles.getCurrent)).profile
          ?.qualifications,
      ).toEqual(qualifications);
      const reviewed = await user.query(api.resumes.getCurrent);
      await user.mutation(api.resumes.finishReview, {
        targetJobTitleIds: reviewed!.targetRoles.map((role) => role.id),
      });
      const upload = async (replacementForId?: Id<"resumeDocuments">) => {
        const storageId = await t.run((ctx) =>
          ctx.storage.store(new Blob(["fixture"], { type: "application/pdf" })),
        );
        return await user.mutation(api.resumes.createFromUpload, {
          storageId,
          fileName: "another.pdf",
          mimeType: "application/pdf",
          size: 7,
          ...(replacementForId
            ? { replacementForId }
            : { activateOnSuccess: false }),
        });
      };
      const replacementId = await upload(first.resumeId);
      await t.mutation(
        internal.resumes.completeProcessing,
        completion(replacementId, first.userId),
      );
      expect(
        (await user.query(api.candidateProfiles.getCurrent)).profile
          ?.qualifications,
      ).toEqual(qualifications);
      const anotherId = await upload();
      await t.mutation(
        internal.resumes.completeProcessing,
        completion(anotherId, first.userId),
      );
      await user.mutation(api.resumes.setActive, { resumeId: anotherId });
      expect(
        (await user.query(api.candidateProfiles.getCurrent)).profile
          ?.qualifications,
      ).toEqual(qualifications);
    },
  );
  it("preserves resume education when selecting a different document", async () => {
    const t = convexTest(schema, modules);
    const first = await seedUserAndResume(t);
    await t.mutation(internal.resumes.completeProcessing, {
      ...completion(first.resumeId, first.userId),
      qualifications: {
        academicDegreeStatus: "completed",
        education: [
          {
            level: "bachelor",
            status: "completed",
            field: "Physics",
            credential: "B.Sc.",
          },
        ],
      },
    });
    const user = asUser(t, first.userId);
    const storageId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["fixture"], { type: "application/pdf" })),
    );
    const secondId = await user.mutation(api.resumes.createFromUpload, {
      storageId,
      fileName: "another.pdf",
      mimeType: "application/pdf",
      size: 7,
      activateOnSuccess: false,
    });
    await t.mutation(
      internal.resumes.completeProcessing,
      completion(secondId, first.userId),
    );
    expect(
      (await user.query(api.candidateProfiles.getCurrent)).profile
        ?.qualifications?.academicDegreeStatus,
    ).toBe("completed");
    const review = await user.query(api.resumes.getCurrent);
    await user.mutation(api.resumes.finishReview, {
      targetJobTitleIds: review!.targetRoles.map((r) => r.id),
    });
    await user.mutation(api.resumes.setActive, { resumeId: secondId });
    expect(
      (await user.query(api.candidateProfiles.getCurrent)).profile
        ?.qualifications,
    ).toEqual({
      academicDegreeStatus: "completed",
      education: [
        {
          level: "bachelor",
          status: "completed",
          field: "Physics",
          credential: "B.Sc.",
        },
      ],
    });
  });
});

describe("onboarding resume education prefill", () => {
  const extractedQualifications = {
    academicDegreeStatus: "none" as const,
    education: [
      {
        level: "diploma" as const,
        status: "in_progress" as const,
        field: "Software Engineering",
        credential: "Practical Engineer",
      },
    ],
  };

  it.each([false, true])(
    "replaces an old education draft on upload (replacement=%s)",
    async (replacement) => {
      const t = convexTest(schema, modules);
      const first = await seedUserAndResume(t);
      const user = asUser(t, first.userId);
      if (replacement)
        await t.mutation(
          internal.resumes.completeProcessing,
          completion(first.resumeId, first.userId),
        );
      await user.mutation(api.candidateProfiles.saveCurrent, {
        values: {
          qualifications: { academicDegreeStatus: "none", education: [] },
        },
        onboardingStep: 2,
        complete: false,
      });
      const storageId = await t.run((ctx) =>
        ctx.storage.store(new Blob(["fixture"], { type: "application/pdf" })),
      );
      const resumeId = await user.mutation(api.resumes.createFromUpload, {
        storageId,
        fileName: "new.pdf",
        mimeType: "application/pdf",
        size: 7,
        ...(replacement ? { replacementForId: first.resumeId } : {}),
      });
      await t.mutation(internal.resumes.completeProcessing, {
        ...completion(resumeId, first.userId),
        qualifications: extractedQualifications,
      });
      const profile = (await user.query(api.candidateProfiles.getCurrent))
        .profile;
      expect(profile?.activeResumeId).toBe(resumeId);
      expect(profile?.qualifications).toEqual(extractedQualifications);
      expect(profile?.manualOverrideFields).not.toContain("qualifications");
    },
  );

  it("keeps education edited after upload while extraction is processing", async () => {
    const t = convexTest(schema, modules);
    const first = await seedUserAndResume(t);
    const user = asUser(t, first.userId);
    await t.mutation(
      internal.resumes.completeProcessing,
      completion(first.resumeId, first.userId),
    );
    const storageId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["fixture"], { type: "application/pdf" })),
    );
    const resumeId = await user.mutation(api.resumes.createFromUpload, {
      storageId,
      fileName: "new.pdf",
      mimeType: "application/pdf",
      size: 7,
      replacementForId: first.resumeId,
    });
    await user.mutation(api.candidateProfiles.saveCurrent, {
      values: {
        qualifications: { academicDegreeStatus: "none", education: [] },
      },
      onboardingStep: 2,
      complete: false,
    });
    await t.mutation(internal.resumes.completeProcessing, {
      ...completion(resumeId, first.userId),
      qualifications: extractedQualifications,
    });
    expect(
      (await user.query(api.candidateProfiles.getCurrent)).profile
        ?.qualifications,
    ).toEqual({ academicDegreeStatus: "none", education: [] });
  });

  it("restores only a pending review at the expected revision using cached extraction", async () => {
    const t = convexTest(schema, modules);
    const first = await seedUserAndResume(t);
    const user = asUser(t, first.userId);
    await t.mutation(internal.resumes.completeProcessing, {
      ...completion(first.resumeId, first.userId),
      qualifications: extractedQualifications,
    });
    await user.mutation(api.candidateProfiles.saveCurrent, {
      values: {
        qualifications: { academicDegreeStatus: "none", education: [] },
      },
      onboardingStep: 2,
      complete: false,
    });
    const profile = (await user.query(api.candidateProfiles.getCurrent))
      .profile!;
    expect(
      await t.mutation(internal.resumes.restoreOnboardingEducation, {
        userId: first.userId,
        expectedProfileUpdatedAt: profile.updatedAt - 1,
      }),
    ).toBe(false);
    expect(
      await t.mutation(internal.resumes.restoreOnboardingEducation, {
        userId: first.userId,
        expectedProfileUpdatedAt: profile.updatedAt,
      }),
    ).toBe(true);
    const restored = (await user.query(api.candidateProfiles.getCurrent))
      .profile!;
    expect(restored.qualifications).toEqual(extractedQualifications);
    expect(restored.profileSourceVersion).toBe(
      profile.profileSourceVersion! + 1,
    );
    await user.mutation(api.resumes.finishReview, {
      targetJobTitleIds: restored.targetJobTitleIds!,
    });
    const completed = (await user.query(api.candidateProfiles.getCurrent))
      .profile!;
    expect(
      await t.mutation(internal.resumes.restoreOnboardingEducation, {
        userId: first.userId,
        expectedProfileUpdatedAt: completed.updatedAt,
      }),
    ).toBe(false);
  });
});

it.each([{ areas: ["Insurance"] }, { areas: [] }])(
  "keeps corrected experience areas %j through CV replacement and switching",
  async ({ areas }) => {
    const t = convexTest(schema, modules);
    const first = await seedUserAndResume(t);
    const user = asUser(t, first.userId);
    await t.mutation(
      internal.resumes.completeProcessing,
      completion(first.resumeId, first.userId),
    );
    const initial = await user.query(api.resumes.getCurrent);
    await user.mutation(api.resumes.finishReview, {
      targetJobTitleIds: initial!.targetRoles.map((role) => role.id),
    });
    await user.mutation(api.candidateProfiles.saveCurrent, {
      values: { experienceDomains: areas },
      onboardingStep: 4,
      complete: false,
    });
    const search = await t.query(
      internal.jobDiscovery.getCurrentSearchProfile,
      { userId: first.userId },
    );
    expect(search.professionalDomains).toEqual(areas);
    expect(search.experienceByDomain).toEqual([
      { domain: "e-commerce", months: 60 },
    ]);
    const upload = async (replacementForId?: Id<"resumeDocuments">) => {
      const storageId = await t.run((ctx) =>
        ctx.storage.store(new Blob(["fixture"], { type: "application/pdf" })),
      );
      return user.mutation(api.resumes.createFromUpload, {
        storageId,
        fileName: "new.pdf",
        mimeType: "application/pdf",
        size: 7,
        ...(replacementForId
          ? { replacementForId }
          : { activateOnSuccess: false }),
      });
    };
    const replacement = await upload(first.resumeId);
    await t.mutation(internal.resumes.completeProcessing, {
      ...completion(replacement, first.userId),
      domains: ["Software Development"],
    });
    expect(
      (await user.query(api.candidateProfiles.getCurrent)).profile
        ?.experienceDomains,
    ).toEqual(areas);
    const other = await upload();
    await t.mutation(internal.resumes.completeProcessing, {
      ...completion(other, first.userId),
      domains: ["Customer Service"],
    });
    await user.mutation(api.resumes.setActive, { resumeId: other });
    expect(
      (
        await t.query(internal.jobDiscovery.getCurrentSearchProfile, {
          userId: first.userId,
        })
      ).professionalDomains,
    ).toEqual(areas);
    expect(
      (await user.query(api.candidateProfiles.getCurrent)).profile
        ?.cvCareerProfile?.domains,
    ).toEqual(["E-commerce"]);
  },
);

it("saves document-only uploads without changing a completed profile, including a manual profile without a source CV", async () => {
  const t = convexTest(schema, modules);
  const first = await seedUserAndResume(t);
  await t.mutation(
    internal.resumes.completeProcessing,
    completion(first.resumeId, first.userId),
  );
  await t.run(async (ctx) => {
    const profile = await ctx.db
      .query("candidateProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", first.userId))
      .unique();
    await ctx.db.patch("candidateProfiles", profile!._id, {
      onboardingCompleted: true,
      activeResumeId: undefined,
      cvReviewPending: false,
    });
  });
  const user = asUser(t, first.userId);
  const before = await user.query(api.candidateProfiles.getCurrent);
  const storageId = await t.run((ctx) =>
    ctx.storage.store(new Blob(["file"], { type: "application/pdf" })),
  );
  const resumeId = await user.mutation(api.resumes.createFromUpload, {
    storageId,
    fileName: "new.pdf",
    mimeType: "application/pdf",
    size: 4,
    activateOnSuccess: true,
  });
  expect(
    (await t.run((ctx) => ctx.db.get("resumeDocuments", resumeId)))
      ?.activateOnSuccess,
  ).toBe(false);
  const text =
    "Complete resume content with professional work history.\n".repeat(2500);
  await t.mutation(internal.resumes.saveExtractedText, {
    resumeId,
    userId: first.userId,
    text,
    finalize: true,
  });
  expect(await user.query(api.candidateProfiles.getCurrent)).toEqual(before);
  const document = await t.run((ctx) =>
    ctx.db.get("resumeDocuments", resumeId),
  );
  expect(document?.extractedText).toBe(text);
  expect(document?.structuredProfileJson).toBeUndefined();
  expect(document?.status).toBe("ready");
});

it("prepares an isolated editable proposal and applies only the approved values with ownership and revision guards", async () => {
  const t = convexTest(schema, modules);
  const first = await seedUserAndResume(t);
  await t.mutation(
    internal.resumes.completeProcessing,
    completion(first.resumeId, first.userId),
  );
  const user = asUser(t, first.userId);
  const initial = await user.query(api.resumes.getCurrent);
  await user.mutation(api.resumes.finishReview, {
    targetJobTitleIds: initial!.targetRoles.map((r) => r.id),
  });
  const before = await user.query(api.candidateProfiles.getCurrent);
  const storageId = await t.run((ctx) =>
    ctx.storage.store(new Blob(["file"], { type: "application/pdf" })),
  );
  const resumeId = await user.mutation(api.resumes.createFromUpload, {
    storageId,
    fileName: "new.pdf",
    mimeType: "application/pdf",
    size: 4,
  });
  await t.mutation(internal.resumes.saveExtractedText, {
    resumeId,
    userId: first.userId,
    text: "Document facts are preserved separately from user preferences.",
    finalize: true,
  });
  await t.mutation(internal.resumes.completeProcessing, {
    ...completion(resumeId, first.userId),
    targetRoles: ["Product Manager"],
    skills: ["Analytics"],
    draftOnly: true,
  });
  const proposal = await user.query(api.resumes.getProfileUpdateDraft, {
    resumeId,
  });
  expect(proposal.selections.targetJobTitles[0].labelEn).toBe(
    "Product Manager",
  );
  expect(await user.query(api.candidateProfiles.getCurrent)).toEqual(before);
  const otherId = await t.run((ctx) =>
    ctx.db.insert("users", { email: "other@example.com" }),
  );
  await expect(
    asUser(t, otherId).query(api.resumes.getProfileUpdateDraft, { resumeId }),
  ).rejects.toThrow("RESUME_NOT_READY");
  const args = {
    values: {
      preferredDisplayName: "Approved Name",
      targetJobTitleIds: before.selections.targetJobTitles.map((r) => r.id),
      professionalSummary: "User-edited summary",
      languages: [{ languageCode: "en", proficiency: "fluent" as const }],
      qualifications: { academicDegreeStatus: "none" as const, education: [] },
    },
    onboardingStep: 4,
    complete: true,
    resumeUpdate: { resumeId, expectedUpdatedAt: before.profile!.updatedAt },
  };
  await expect(
    asUser(t, otherId).mutation(api.candidateProfiles.saveCurrent, args),
  ).rejects.toThrow("RESUME_PROFILE_UPDATE_CONFLICT");
  await expect(
    user.mutation(api.candidateProfiles.saveCurrent, {
      ...args,
      resumeUpdate: {
        ...args.resumeUpdate,
        expectedUpdatedAt: before.profile!.updatedAt - 1,
      },
    }),
  ).rejects.toThrow("RESUME_PROFILE_UPDATE_CONFLICT");
  await user.mutation(api.candidateProfiles.saveCurrent, args);
  const after = await user.query(api.candidateProfiles.getCurrent);
  expect(after.profile?.preferredDisplayName).toBe("Approved Name");
  expect(after.profile?.professionalSummary).toBe("User-edited summary");
  expect(after.selections.targetJobTitles).toEqual(
    before.selections.targetJobTitles,
  );
  expect(after.profile?.activeResumeId).toBe(resumeId);
  expect(after.profile?.onboardingCompleted).toBe(true);
  expect(after.profile?.cvReviewPending).toBe(false);
});

it("bounds the resume library and rejects oversized extraction without storing partial content", async () => {
  const t = convexTest(schema, modules);
  const first = await seedUserAndResume(t);
  const user = asUser(t, first.userId);
  await expect(
    t.mutation(internal.resumes.saveExtractedText, {
      resumeId: first.resumeId,
      userId: first.userId,
      text: "א".repeat(200_001),
      finalize: true,
    }),
  ).rejects.toThrow("RESUME_TEXT_TOO_LARGE");
  expect(
    (await t.run((ctx) => ctx.db.get("resumeDocuments", first.resumeId)))
      ?.extractedText,
  ).toBeUndefined();
  const storageId = await t.run(async (ctx) => {
    const base = (await ctx.db.get("resumeDocuments", first.resumeId))!;
    const { _id, _creationTime, ...fields } = base;
    void _id;
    void _creationTime;
    for (let index = 0; index < 24; index++)
      await ctx.db.insert("resumeDocuments", {
        ...fields,
        fileName: `resume-${index}.pdf`,
      });
    return ctx.storage.store(new Blob(["new"], { type: "application/pdf" }));
  });
  await expect(
    user.mutation(api.resumes.createFromUpload, {
      storageId,
      fileName: "extra.pdf",
      mimeType: "application/pdf",
      size: 3,
      activateOnSuccess: false,
    }),
  ).rejects.toThrow("RESUME_LIMIT_REACHED");
});

it("queues uploads atomically and claims only one processing worker", async () => {
  const t = convexTest(schema, modules);
  const { userId, resumeId } = await seedUserAndResume(t);
  const storageId = await t.run((ctx) =>
    ctx.storage.store(new Blob(["fixture"], { type: "application/pdf" })),
  );
  const uploaded = await asUser(t, userId).mutation(
    api.resumes.createFromUpload,
    {
      storageId,
      fileName: "library.pdf",
      mimeType: "application/pdf",
      size: 7,
      activateOnSuccess: false,
    },
  );
  const pending = await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  expect(
    pending.some(
      (item) =>
        item.name === "resumeActions:processQueuedResume" &&
        item.args[0].resumeId === uploaded,
    ),
  ).toBe(true);
  expect(
    await t.mutation(internal.resumes.claimProcessing, { resumeId }),
  ).toMatchObject({ userId });
  expect(
    await t.mutation(internal.resumes.claimProcessing, { resumeId }),
  ).toBeNull();
});

it("restricts retry ownership, preserves cached text, and recovers a stalled worker without changing the profile", async () => {
  const t = convexTest(schema, modules);
  const { userId, resumeId } = await seedUserAndResume(t);
  const { userId: otherId } = await seedUserAndResume(t, "Other");
  await t.run((ctx) =>
    ctx.db.patch("resumeDocuments", resumeId, {
      status: "failed",
      failureCode: "CV_SCHEMA_INVALID",
      extractedText: "Already extracted CV content",
    }),
  );
  await expect(
    asUser(t, otherId).mutation(api.resumes.retryProcessing, { resumeId }),
  ).rejects.toThrow("RESUME_NOT_FOUND");
  await asUser(t, userId).mutation(api.resumes.retryProcessing, { resumeId });
  await t.run(async (ctx) => {
    expect((await ctx.db.get("resumeDocuments", resumeId))?.extractedText).toBe(
      "Already extracted CV content",
    );
    await ctx.db.patch("resumeDocuments", resumeId, {
      updatedAt: Date.now() - 11 * 60_000,
      processingLeaseUntil: Date.now() - 1,
      processingAttempts: 1,
    });
  });
  expect(await t.mutation(internal.resumes.recoverStalledProcessing, {})).toBe(
    1,
  );
  await t.run(async (ctx) => {
    expect((await ctx.db.get("resumeDocuments", resumeId))?.status).toBe(
      "processing",
    );
    await ctx.db.patch("resumeDocuments", resumeId, {
      updatedAt: Date.now() - 11 * 60_000,
      processingAttempts: 3,
    });
  });
  await t.mutation(internal.resumes.recoverStalledProcessing, {});
  expect(
    await t.run((ctx) => ctx.db.get("resumeDocuments", resumeId)),
  ).toMatchObject({
    status: "failed",
    failureCode: "PROCESSING_TIMEOUT",
    extractedText: "Already extracted CV content",
  });
});

it("repairs old extraction failures as documents without importing them into an approved profile", async () => {
  const t = convexTest(schema, modules);
  const { userId, resumeId } = await seedUserAndResume(t);
  await t.mutation(
    internal.resumes.completeProcessing,
    completion(resumeId, userId),
  );
  const profile = await t.run(async (ctx) => {
    const p = (await ctx.db
      .query("candidateProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique())!;
    await ctx.db.patch("candidateProfiles", p._id, {
      onboardingCompleted: true,
    });
    await ctx.db.patch("resumeDocuments", resumeId, {
      status: "failed",
      failureCode: "CV_AI_PARSE_FAILED",
      extractedText: undefined,
      activateOnSuccess: true,
    });
    return ctx.db.get("candidateProfiles", p._id);
  });
  expect(
    await t.mutation(internal.resumes.repairFailedExtractions, {
      resumeIds: [resumeId],
    }),
  ).toBe(1);
  expect(
    await t.run((ctx) => ctx.db.get("resumeDocuments", resumeId)),
  ).toMatchObject({ activateOnSuccess: false });
  await t.mutation(internal.resumes.saveExtractedText, {
    userId,
    resumeId,
    text: "Recovered document text",
    finalize: true,
  });
  expect(
    await t.run((ctx) => ctx.db.get("candidateProfiles", profile!._id)),
  ).toEqual(profile);
});
