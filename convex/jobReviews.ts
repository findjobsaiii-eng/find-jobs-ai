import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { isUserFacingJobSource } from "./jobSourceProvenance";

const reviewLanguage = v.union(v.literal("en"), v.literal("he"));
const reviewVerdict = v.union(
  v.literal("strong"),
  v.literal("good"),
  v.literal("stretch"),
  v.literal("low"),
);
const importance = v.union(
  v.literal("must_have"),
  v.literal("important"),
  v.literal("minor"),
);
const resumeContext = v.object({
  id: v.id("resumeDocuments"),
  key: v.string(),
  name: v.string(),
  note: v.union(v.string(), v.null()),
  text: v.string(),
  isActive: v.boolean(),
});
const jobContext = v.object({
  title: v.string(),
  companyName: v.string(),
  descriptionText: v.union(v.string(), v.null()),
  requirementsText: v.union(v.string(), v.null()),
  responsibilities: v.array(v.string()),
  requiredSkills: v.array(v.string()),
  preferredSkills: v.array(v.string()),
  requiredExperienceYearsMin: v.union(v.number(), v.null()),
  requiredExperienceYearsMax: v.union(v.number(), v.null()),
  educationRequirements: v.array(v.string()),
  languages: v.array(v.string()),
  locationText: v.union(v.string(), v.null()),
  workArrangement: v.string(),
  employmentType: v.string(),
  salaryMin: v.union(v.number(), v.null()),
  salaryMax: v.union(v.number(), v.null()),
  salaryCurrency: v.union(v.string(), v.null()),
  salaryPeriod: v.union(v.string(), v.null()),
  workAuthorizationRequirements: v.union(v.string(), v.null()),
  sourceUrl: v.string(),
  sourceTier: v.string(),
  sourceText: v.union(v.string(), v.null()),
});

function usableResume(resume: Doc<"resumeDocuments">) {
  return (
    ["ready", "needs_confirmation", "replaced"].includes(resume.status) &&
    Boolean(resume.extractedText?.trim())
  );
}

export const prepare = internalMutation({
  args: {
    userId: v.id("users"),
    jobId: v.id("jobs"),
    language: reviewLanguage,
    requestId: v.string(),
  },
  returns: v.object({
    reviewId: v.id("jobDeepReviews"),
    sourceId: v.id("jobSources"),
    profileRevision: v.number(),
    jobContentHash: v.string(),
    job: jobContext,
    resumes: v.array(resumeContext),
  }),
  handler: async (ctx, args) => {
    const [job, profile, match, application] = await Promise.all([
      ctx.db.get("jobs", args.jobId),
      ctx.db
        .query("candidateProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .unique(),
      ctx.db
        .query("jobMatches")
        .withIndex("by_userId_and_jobId", (q) =>
          q.eq("userId", args.userId).eq("jobId", args.jobId),
        )
        .unique(),
      ctx.db
        .query("jobApplications")
        .withIndex("by_userId_and_jobId", (q) =>
          q.eq("userId", args.userId).eq("jobId", args.jobId),
        )
        .unique(),
    ]);
    if (!job || !profile?.onboardingCompleted)
      throw new Error("REVIEW_CONTEXT_NOT_FOUND");
    if (!match?.displayEligible && !application)
      throw new Error("JOB_NOT_AVAILABLE_TO_USER");
    const source = job.bestSourceId
      ? await ctx.db.get("jobSources", job.bestSourceId)
      : null;
    if (!source?.finalUrl || !isUserFacingJobSource(source))
      throw new Error("JOB_SOURCE_NOT_AVAILABLE");

    const allResumes = await ctx.db
      .query("resumeDocuments")
      .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(12);
    const usable = allResumes.filter(usableResume).slice(0, 6);
    usable.sort((left, right) => {
      if (left._id === profile.activeResumeId) return -1;
      if (right._id === profile.activeResumeId) return 1;
      return right.createdAt - left.createdAt;
    });
    let remainingCharacters = 48_000;
    const resumes = usable.flatMap((resume, index) => {
      if (remainingCharacters <= 0) return [];
      const text = (resume.extractedText ?? "").slice(
        0,
        Math.min(remainingCharacters, 12_000),
      );
      remainingCharacters -= text.length;
      return [
        {
          id: resume._id,
          key: `resume_${index + 1}`,
          name:
            resume.displayName ??
            resume.fileName.replace(/\.(?:pdf|docx)$/iu, ""),
          note: resume.note ?? null,
          text,
          isActive: resume._id === profile.activeResumeId,
        },
      ];
    });

    const now = Date.now();
    const existing = await ctx.db
      .query("jobDeepReviews")
      .withIndex("by_userId_and_jobId", (q) =>
        q.eq("userId", args.userId).eq("jobId", args.jobId),
      )
      .unique();
    if (
      existing?.status === "pending" &&
      existing.updatedAt > now - 2 * 60 * 1_000
    )
      throw new Error("REVIEW_ALREADY_RUNNING");
    const pending = {
      userId: args.userId,
      jobId: args.jobId,
      status: "pending" as const,
      requestId: args.requestId,
      language: args.language,
      profileRevision: profile.updatedAt,
      jobContentHash: job.contentHash,
      requestedAt: now,
      updatedAt: now,
      completedAt: undefined,
      errorCode: undefined,
    };
    let reviewId: Id<"jobDeepReviews">;
    if (existing) {
      await ctx.db.patch("jobDeepReviews", existing._id, pending);
      reviewId = existing._id;
    } else {
      reviewId = await ctx.db.insert("jobDeepReviews", pending);
    }

    return {
      reviewId,
      sourceId: source._id,
      profileRevision: profile.updatedAt,
      jobContentHash: job.contentHash,
      job: {
        title: job.title,
        companyName: job.companyName,
        descriptionText: job.descriptionText,
        requirementsText: job.requirementsText,
        responsibilities: job.responsibilities,
        requiredSkills: job.requiredSkills,
        preferredSkills: job.preferredSkills,
        requiredExperienceYearsMin: job.requiredExperienceYearsMin,
        requiredExperienceYearsMax: job.requiredExperienceYearsMax,
        educationRequirements: job.educationRequirements,
        languages: job.languages,
        locationText: job.locationText,
        workArrangement: job.workArrangement,
        employmentType: job.employmentType,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        salaryCurrency: job.salaryCurrency,
        salaryPeriod: job.salaryPeriod,
        workAuthorizationRequirements:
          job.workAuthorizationRequirements ?? null,
        sourceUrl: source.finalUrl,
        sourceTier: source.sourceTier,
        sourceText: source.rawSourceText?.slice(0, 20_000) ?? null,
      },
      resumes,
    };
  },
});

export const complete = internalMutation({
  args: {
    userId: v.id("users"),
    reviewId: v.id("jobDeepReviews"),
    requestId: v.string(),
    model: v.string(),
    resumeId: v.optional(v.id("resumeDocuments")),
    resumeName: v.optional(v.string()),
    matchPercentage: v.number(),
    verdict: reviewVerdict,
    summary: v.string(),
    strengths: v.array(v.object({ title: v.string(), detail: v.string() })),
    gaps: v.array(
      v.object({
        requirement: v.string(),
        currentEvidence: v.string(),
        howToClose: v.string(),
        importance,
      }),
    ),
    resumeRationale: v.string(),
    resumeChanges: v.array(
      v.object({
        section: v.string(),
        change: v.string(),
        reason: v.string(),
      }),
    ),
    companyWebsiteUrl: v.union(v.string(), v.null()),
    directApplicationUrl: v.union(v.string(), v.null()),
    applicationNote: v.string(),
    interviewFocus: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const review = await ctx.db.get("jobDeepReviews", args.reviewId);
    if (
      !review ||
      review.userId !== args.userId ||
      review.status !== "pending" ||
      review.requestId !== args.requestId
    )
      throw new Error("INVALID_REVIEW");
    if (args.resumeId) {
      const resume = await ctx.db.get("resumeDocuments", args.resumeId);
      if (!resume || resume.userId !== args.userId)
        throw new Error("INVALID_REVIEW_RESUME");
    }
    const {
      reviewId: _reviewId,
      userId: _userId,
      requestId: _requestId,
      ...result
    } = args;
    const now = Date.now();
    await ctx.db.patch("jobDeepReviews", review._id, {
      ...result,
      status: "completed",
      completedAt: now,
      updatedAt: now,
      errorCode: undefined,
    });
    return null;
  },
});

export const fail = internalMutation({
  args: {
    userId: v.id("users"),
    reviewId: v.id("jobDeepReviews"),
    requestId: v.string(),
    errorCode: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const review = await ctx.db.get("jobDeepReviews", args.reviewId);
    if (
      !review ||
      review.userId !== args.userId ||
      review.requestId !== args.requestId
    )
      return null;
    await ctx.db.patch("jobDeepReviews", review._id, {
      status: "failed",
      errorCode: args.errorCode.slice(0, 80),
      updatedAt: Date.now(),
    });
    return null;
  },
});
