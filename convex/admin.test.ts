/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest, type TestConvex } from "convex-test";
import { expect, it } from "vitest";
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

it("keeps every admin query closed to ordinary signed-in users", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", { email: "user@example.com" }),
  );
  const user = asUser(t, userId);

  expect(await user.query(api.admin.getAccess)).toMatchObject({
    authenticated: true,
    isAdmin: false,
  });
  await expect(
    user.query(api.admin.listSearches, {
      dayKey: "2026-09-24",
      start: 0,
      end: 1,
    }),
  ).rejects.toThrow(/ADMIN_REQUIRED/u);
  await expect(user.query(api.admin.listUsers)).rejects.toThrow(
    /ADMIN_REQUIRED/u,
  );
});

it("shows normalized job extraction and exact experience evidence to admins", async () => {
  const t = convexTest(schema, modules);
  const now = Date.now();
  const { adminId, subjectId, jobId } = await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", {
      email: "admin@example.com",
      name: "Admin",
    });
    const subjectId = await ctx.db.insert("users", {
      email: "junior@example.com",
      name: "Junior",
    });
    await ctx.db.insert("adminMemberships", {
      userId: adminId,
      role: "admin",
      active: true,
      grantedBy: "test",
      createdAt: now,
      updatedAt: now,
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
      createdAt: now,
      updatedAt: now,
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
      createdAt: now,
      updatedAt: now,
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
    await ctx.db.insert("candidateProfiles", {
      userId: subjectId,
      email: "junior@example.com",
      targetJobTitleIds: [titleId],
      skillIds: [skillId],
      yearsOfExperience: 0,
      preferredPlaceIds: [location.placeId],
      locationRadiusKm: location.radiusKm,
      primaryLocation: location,
      workArrangements: ["hybrid"],
      employmentTypes: ["full-time"],
      onboardingCompleted: true,
      onboardingStep: 4,
      createdAt: now,
      updatedAt: now,
    });
    const sourceUrl =
      "https://linkedin.com/signup/cold-join?session_redirect=https%3A%2F%2Fil.linkedin.com%2Fjobs%2Fview%2Ffrontend-engineer-4458647686";
    const jobId = await ctx.db.insert("jobs", {
      rawProviderJson: JSON.stringify({
        title: "Frontend Engineer",
        requiredExperienceYearsMin: null,
      }),
      normalizedSourceUrl: sourceUrl,
      jobFingerprint: "frontend-example-tel-aviv",
      contentHash: "content-v1",
      title: "Frontend Engineer",
      companyName: "Example",
      sourceUrl,
      sourceName: "LinkedIn",
      sourceType: "job_board",
      descriptionText: "Build React interfaces.",
      requirementsText: "4-5 years of frontend experience.",
      responsibilities: ["Build interfaces"],
      requiredSkills: ["React", "TypeScript"],
      preferredSkills: [],
      requiredExperienceYearsMin: null,
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
    return { adminId, subjectId, jobId };
  });

  const admin = asUser(t, adminId);
  const detail = await admin.query(api.admin.getJobDetail, { jobId });
  expect(detail).toMatchObject({
    sourceUrl: "https://www.linkedin.com/jobs/view/4458647686",
    experience: { storedMin: null, resolvedMin: 4, resolvedMax: 5 },
  });
  expect(detail?.normalizedJson).toContain('"requiredSkills"');
  expect(detail?.providerJson).toContain('"Frontend Engineer"');

  const explanation = await admin.query(api.admin.explainUserJob, {
    userId: subjectId,
    jobId,
    now,
  });
  expect(explanation).toMatchObject({
    visible: false,
    exclusionReasons: expect.arrayContaining(["experience_conflict"]),
    experience: {
      candidateYears: 0,
      storedMin: null,
      resolvedMin: 4,
      resolvedMax: 5,
      eligible: false,
    },
    profileEvidence: { yearsOfExperience: 0 },
  });
  expect(explanation?.checks).toContainEqual(
    expect.objectContaining({ key: "experience", passed: false }),
  );
});

it("bootstraps an admin by exact normalized email and audits user views", async () => {
  const t = convexTest(schema, modules);
  const { adminId, subjectId } = await t.run(async (ctx) => ({
    adminId: await ctx.db.insert("users", {
      email: "admin@example.com",
      name: "Admin",
    }),
    subjectId: await ctx.db.insert("users", {
      email: "candidate@example.com",
      name: "Candidate",
    }),
  }));

  expect(
    await t.mutation(internal.admin.grantAdminByEmail, {
      email: " ADMIN@example.com ",
      grantedBy: "bootstrap test",
    }),
  ).toBe(adminId);

  const admin = asUser(t, adminId);
  expect(await admin.query(api.admin.getAccess)).toMatchObject({
    authenticated: true,
    isAdmin: true,
  });
  await admin.mutation(api.admin.recordUserView, {
    subjectUserId: subjectId,
  });

  await t.run(async (ctx) => {
    const event = await ctx.db.query("adminAuditEvents").unique();
    expect(event).toMatchObject({
      actorAdminUserId: adminId,
      subjectUserId: subjectId,
      action: "user.read_only_view_started",
    });
  });
});
