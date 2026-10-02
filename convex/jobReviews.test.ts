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
    subject: `${userId}|test-session`,
    issuer: "https://test.example",
    tokenIdentifier: `https://test.example|${userId}`,
  });
}

async function setupReviewContext(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "candidate@example.com",
      name: "Candidate",
    });
    const titleId = await ctx.db.insert("catalogItems", {
      kind: "jobTitle",
      labelEn: "Frontend Engineer",
      normalizedKey: "frontend engineer",
      normalizedLabels: ["frontend engineer"],
      searchText: "frontend engineer",
      visibility: "public",
      source: "curated",
      priority: 1,
      active: true,
      createdAt: 1,
      updatedAt: 1,
    });
    const skillId = await ctx.db.insert("catalogItems", {
      kind: "skill",
      labelEn: "React",
      normalizedKey: "react",
      normalizedLabels: ["react"],
      searchText: "react",
      visibility: "public",
      source: "curated",
      priority: 1,
      active: true,
      createdAt: 1,
      updatedAt: 1,
    });
    const storageId = await ctx.storage.store(
      new Blob(["Frontend engineer with React and TypeScript experience."]),
    );
    const resumeId = await ctx.db.insert("resumeDocuments", {
      userId,
      storageId,
      fileName: "frontend.pdf",
      displayName: "Frontend CV",
      mimeType: "application/pdf",
      size: 60,
      status: "ready",
      extractedText: "Frontend engineer with React and TypeScript experience.",
      createdAt: 1,
      updatedAt: 1,
    });
    const location = {
      placeId: "tel-aviv",
      formattedAddress: "Tel Aviv, Israel",
      city: "Tel Aviv",
      country: "Israel",
      countryCode: "IL",
      latitude: 32.0853,
      longitude: 34.7818,
      radiusKm: 25,
    };
    const profileRevision = 10;
    await ctx.db.insert("candidateProfiles", {
      userId,
      email: "candidate@example.com",
      targetJobTitleIds: [titleId],
      skillIds: [skillId],
      yearsOfExperience: 5,
      preferredPlaceIds: [location.placeId],
      locationRadiusKm: 25,
      primaryLocation: location,
      workArrangements: ["hybrid"],
      employmentTypes: ["full-time"],
      languages: [{ languageCode: "en", proficiency: "fluent" }],
      minimumMonthlySalaryIls: 0,
      onboardingStep: 4,
      onboardingCompleted: true,
      activeResumeId: resumeId,
      createdAt: 1,
      updatedAt: profileRevision,
      completedAt: 1,
    });
    const now = Date.now();
    const jobId = await ctx.db.insert("jobs", {
      normalizedSourceUrl: "https://careers.example.com/frontend",
      jobFingerprint: "example-frontend-tel-aviv",
      contentHash: "content-v1",
      canonicalKey: "example-frontend-tel-aviv",
      title: "Frontend Engineer",
      companyName: "Example",
      sourceUrl: "https://careers.example.com/frontend",
      sourceName: "Example Careers",
      sourceType: "employer",
      descriptionText: "Build React products in Tel Aviv.",
      requirementsText: "React, TypeScript, and five years of experience.",
      responsibilities: ["Build product interfaces"],
      requiredSkills: ["React", "TypeScript"],
      preferredSkills: [],
      requiredExperienceYearsMin: 5,
      requiredExperienceYearsMax: null,
      educationRequirements: [],
      languages: ["English"],
      country: "Israel",
      city: "Tel Aviv",
      locationText: "Tel Aviv, Israel",
      geo: {
        placeId: "tel-aviv",
        countryCode: "IL",
        latitude: 32.0853,
        longitude: 34.7818,
        precision: "locality_centroid",
      },
      workArrangement: "hybrid",
      employmentType: "full-time",
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      salaryPeriod: null,
      postedAt: null,
      applicationDeadline: null,
      sourceEvidence: [],
      firstDiscoveredAt: now,
      lastDiscoveredAt: now,
      lastVerifiedAt: now,
      activityStatus: "active",
      lifecycleStatus: "verified_active",
    });
    const sourceId = await ctx.db.insert("jobSources", {
      jobId,
      sourceName: "Example Careers",
      sourceUrl: "https://careers.example.com/frontend",
      normalizedUrl: "https://careers.example.com/frontend",
      finalUrl: "https://careers.example.com/frontend",
      domain: "careers.example.com",
      sourceTier: "employer",
      firstSeenAt: now,
      lastSeenAt: now,
      lastVerifiedAt: now,
      activityStatus: "verified_active",
      activeEvidenceType: "active_application_flow",
      rawSourceText: "Example is hiring a Frontend Engineer.",
    });
    await ctx.db.patch("jobs", jobId, { bestSourceId: sourceId });
    await ctx.db.insert("jobMatches", {
      userId,
      jobId,
      profileRevision,
      displayEligible: true,
      matchQuality: "partial",
      outcome: "eligible",
      exclusionReasons: [],
      relevanceScore: 90,
      scoreComponents: {
        role: 35,
        requiredSkills: 18,
        preferredSkills: 0,
        experience: 10,
        location: 5,
        workArrangement: 0,
        employmentType: 0,
        language: 0,
        education: 0,
        semantic: 0,
      },
      matchReasons: ["target_role", "core_skills", "location"],
      resultSource: "central",
      evaluatedAt: now,
    });
    return { userId, jobId, resumeId };
  });
}

describe("deep job reviews", () => {
  it("prepares bounded owned context and persists the completed review", async () => {
    const t = convexTest(schema, modules);
    const { userId, jobId, resumeId } = await setupReviewContext(t);
    const context = await t.mutation(internal.jobReviews.prepare, {
      userId,
      jobId,
      language: "en",
      requestId: "request-1",
    });
    expect(context.resumes).toMatchObject([
      { id: resumeId, key: "resume_1", name: "Frontend CV", isActive: true },
    ]);
    expect(context.job.sourceUrl).toBe("https://careers.example.com/frontend");

    expect(context.matching.verdict).toBe("stretch");
    expect(context.matching.requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ requirement: "React", status: "met" }),
        expect.objectContaining({
          requirement: "TypeScript",
          status: "unknown",
        }),
      ]),
    );

    await t.mutation(internal.jobReviews.complete, {
      userId,
      reviewId: context.reviewId,
      requestId: "request-1",
      model: "test-model",
      resumeId,
      resumeName: "Frontend CV",
      matchPercentage: 88,
      verdict: "strong",
      summary: "A strong, evidence-backed match.",
      requirements: [
        {
          requirement: "React",
          status: "met",
          importance: "must_have",
          evidence: "The resume shows React work.",
          nextStep: null,
        },
        {
          requirement: "Python",
          status: "unknown",
          importance: "minor",
          evidence: "Python is not present in the resume.",
          nextStep: "Add it only if you have real experience.",
        },
      ],
      resumeRationale: "This version emphasizes frontend delivery.",
      resumeChanges: [
        {
          section: "Summary",
          change: "Lead with React product outcomes.",
          reason: "The role prioritizes React.",
        },
      ],
      companyWebsiteUrl: "https://example.com",
      directApplicationUrl: "https://careers.example.com/frontend",
      applicationNote: "Apply through the employer careers page.",
      interviewFocus: ["Prepare a React architecture example."],
      salaryEstimate: {
        min: 18000,
        max: 25000,
        currency: "ILS",
        period: "month",
        basis: "Frontend role in Tel Aviv.",
      },
    });

    const feed = await asUser(t, userId).query(
      api.jobDiscovery.listCurrentUserJobs,
      { view: "suggestions" },
    );
    expect(feed.jobs[0].deepReview).toMatchObject({
      status: "completed",
      stale: true,
      matchPercentage: 88,
      resumeId,
      resumeName: "Frontend CV",
      resumeOptions: [{ id: resumeId, name: "Frontend CV" }],
      salaryEstimate: {
        min: 18000,
        max: 25000,
        currency: "ILS",
        period: "month",
        basis: "Frontend role in Tel Aviv.",
      },
      requirements: [
        expect.objectContaining({ status: "met" }),
        expect.objectContaining({ status: "unknown" }),
      ],
    });
    // Cached conclusions from a previous matching policy must be marked stale.
    // Fresh server conclusions remain current even with resume-specific prose.
    await t.run((ctx) =>
      ctx.db.patch("jobDeepReviews", context.reviewId, {
        matchPercentage: context.matching.matchPercentage,
        verdict: context.matching.verdict,
        requirements: context.matching.requirements.map((requirement) => ({
          ...requirement,
          evidence: "A short resume-specific explanation.",
        })),
      }),
    );
    const refreshed = await asUser(t, userId).query(
      api.jobDiscovery.listCurrentUserJobs,
      { view: "suggestions" },
    );
    expect(refreshed.jobs[0].deepReview?.stale).toBe(false);
  });

  it("does not let an older concurrent request overwrite a newer review", async () => {
    const t = convexTest(schema, modules);
    const { userId, jobId } = await setupReviewContext(t);
    const first = await t.mutation(internal.jobReviews.prepare, {
      userId,
      jobId,
      language: "en",
      requestId: "request-1",
    });
    await t.run((ctx) =>
      ctx.db.patch("jobDeepReviews", first.reviewId, {
        updatedAt: Date.now() - 3 * 60 * 1_000,
      }),
    );
    await t.mutation(internal.jobReviews.prepare, {
      userId,
      jobId,
      language: "he",
      requestId: "request-2",
    });
    await expect(
      t.mutation(internal.jobReviews.fail, {
        userId,
        reviewId: first.reviewId,
        requestId: "request-1",
        errorCode: "provider_failure",
      }),
    ).resolves.toBeNull();
    await t.run(async (ctx) => {
      expect(await ctx.db.get("jobDeepReviews", first.reviewId)).toMatchObject({
        status: "pending",
        language: "he",
        requestId: "request-2",
      });
    });
  });
});

// Resume cards must use the reviewed user's documents, including in admin previews.
it("keeps other users' resumes out of the compared resume cards", async () => {
  const t = convexTest(schema, modules);
  const { userId, jobId, resumeId } = await setupReviewContext(t);
  await t.run(async (ctx) => {
    const foreignUserId = await ctx.db.insert("users", {
      email: "another@example.com",
    });
    const storageId = await ctx.storage.store(
      new Blob(["Private resume text"]),
    );
    await ctx.db.insert("resumeDocuments", {
      userId: foreignUserId,
      storageId,
      fileName: "private.pdf",
      mimeType: "application/pdf",
      size: 19,
      status: "ready",
      extractedText: "Private resume text",
      createdAt: 100,
      updatedAt: 100,
    });
  });
  const context = await t.mutation(internal.jobReviews.prepare, {
    userId,
    jobId,
    language: "en",
    requestId: "private-resumes",
  });
  expect(context.resumes.map((resume) => resume.id)).toEqual([resumeId]);
  await t.run(async (ctx) => {
    expect(
      (await ctx.db.get("jobDeepReviews", context.reviewId))?.resumeOptions,
    ).toEqual([{ id: resumeId, name: "Frontend CV" }]);
  });
});
