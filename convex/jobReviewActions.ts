"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, env } from "./_generated/server";
import { normalizePublicUrl } from "./jobDiscoveryModel";
import { deepReviewResponseSchema } from "./jobReviewModel";
import { verifyJobSource } from "./jobSourceVerification";

function requiredConfiguration(name: string, value: string | undefined) {
  if (!value?.trim())
    throw new ConvexError({
      code: "OPENAI_CONFIGURATION_ERROR",
      variable: name,
    });
  return value.trim();
}

function collectWebEvidence(output: unknown) {
  const urls = new Set<string>();
  if (!Array.isArray(output)) return urls;
  const record = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === "object";
  for (const item of output) {
    if (
      !record(item) ||
      item.type !== "web_search_call" ||
      !record(item.action)
    )
      continue;
    const values: unknown[] = [];
    if ("url" in item.action) values.push(item.action.url);
    if (Array.isArray(item.action.sources)) {
      for (const source of item.action.sources) {
        if (record(source)) values.push(source.url);
      }
    }
    for (const value of values) {
      if (typeof value !== "string") continue;
      const normalized = normalizePublicUrl(value);
      if (normalized) urls.add(normalized);
    }
  }
  return urls;
}

function evidenceBackedUrl(value: string | null, allowed: Set<string>) {
  if (!value) return null;
  const normalized = normalizePublicUrl(value);
  return normalized && allowed.has(normalized) ? normalized : null;
}

function providerErrorCode(error: unknown) {
  if (error instanceof OpenAI.APIConnectionError) return "provider_connection";
  if (error instanceof OpenAI.RateLimitError) return "provider_rate_limit";
  if (error instanceof OpenAI.AuthenticationError)
    return "provider_authentication";
  if (error instanceof OpenAI.BadRequestError) return "provider_request";
  return "provider_failure";
}

function convexErrorCode(error: unknown) {
  if (!(error instanceof ConvexError)) return null;
  const data = error.data as { code?: unknown } | undefined;
  return typeof data?.code === "string" ? data.code : null;
}

export const reviewJob = action({
  args: {
    jobId: v.id("jobs"),
    language: v.union(v.literal("en"), v.literal("he")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "UNAUTHENTICATED" });
    const plan = await ctx.runQuery(internal.jobDiscovery.getUserPlan, {
      userId,
      now: Date.now(),
    });
    if (plan === "free") throw new ConvexError({ code: "REVIEW_REQUIRES_PRO" });

    const apiKey = requiredConfiguration("OPENAI_API_KEY", env.OPENAI_API_KEY);
    const model = requiredConfiguration(
      "OPENAI_JOB_REVIEW_MODEL",
      env.OPENAI_JOB_REVIEW_MODEL ?? env.OPENAI_JOB_SEARCH_MODEL,
    );
    const profile = await ctx.runQuery(
      internal.jobDiscovery.getCurrentSearchProfile,
      { userId },
    );
    const requestId = crypto.randomUUID();
    const context = await ctx.runMutation(internal.jobReviews.prepare, {
      userId,
      jobId: args.jobId,
      language: args.language,
      requestId,
    });

    try {
      const verification = await verifyJobSource({
        title: context.job.title,
        companyName: context.job.companyName,
        sourceUrl: context.job.sourceUrl,
        sourceType:
          context.job.sourceTier === "aggregator"
            ? "other"
            : context.job.sourceTier,
      });
      await ctx.runMutation(internal.jobActivity.recordVerification, {
        sourceId: context.sourceId,
        verification,
      });
      if (verification.activityStatus === "inactive") {
        await ctx.runMutation(internal.jobReviews.fail, {
          userId,
          reviewId: context.reviewId,
          requestId,
          errorCode: "job_inactive",
        });
        throw new ConvexError({ code: "JOB_NO_LONGER_ACTIVE" });
      }
      const reviewedJob = {
        ...context.job,
        sourceUrl: verification.finalUrl ?? context.job.sourceUrl,
        sourceText: verification.rawSourceText ?? context.job.sourceText,
      };

      const client = new OpenAI({ apiKey, maxRetries: 0, timeout: 60_000 });
      const response = await client.responses.parse({
        model,
        store: false,
        max_output_tokens: 4_500,
        max_tool_calls: 3,
        include: ["web_search_call.action.sources"],
        tools: [{ type: "web_search", search_context_size: "medium" }],
        input: [
          {
            role: "system",
            content: [
              "You are a rigorous career advisor. Compare only facts stated in the supplied job, candidate profile, and resumes.",
              "Never invent candidate experience or qualifications. A missing skill is a gap, not implied experience.",
              "Choose the strongest existing resume by resumeKey and recommend concrete truthful edits for this role.",
              "Use web search to find the employer's official website and, when possible, the employer or official ATS application page for this exact role.",
              "Prefer an employer-owned careers page or official ATS over recruiters, staffing agencies, aggregators, and job boards.",
              "Return null for URLs that cannot be verified through web search. Do not fabricate URLs.",
              `Write all explanatory text in ${args.language === "he" ? "natural Hebrew" : "clear English"}.`,
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({
              job: reviewedJob,
              candidateProfile: profile,
              resumes: context.resumes,
            }),
          },
        ],
        text: {
          format: zodTextFormat(deepReviewResponseSchema, "job_deep_review"),
        },
      });
      const parsed = response.output_parsed;
      if (!parsed) throw new Error("EMPTY_REVIEW_RESPONSE");

      const allowedUrls = collectWebEvidence(response.output);
      const currentSourceUrl = normalizePublicUrl(reviewedJob.sourceUrl);
      if (currentSourceUrl) allowedUrls.add(currentSourceUrl);
      const selectedResume = parsed.resumeKey
        ? context.resumes.find((resume) => resume.key === parsed.resumeKey)
        : undefined;

      await ctx.runMutation(internal.jobReviews.complete, {
        userId,
        reviewId: context.reviewId,
        requestId,
        model,
        ...(selectedResume
          ? { resumeId: selectedResume.id, resumeName: selectedResume.name }
          : {}),
        matchPercentage: parsed.matchPercentage,
        verdict: parsed.verdict,
        summary: parsed.summary,
        strengths: parsed.strengths,
        gaps: parsed.gaps,
        resumeRationale: parsed.resumeRationale,
        resumeChanges: parsed.resumeChanges,
        companyWebsiteUrl: evidenceBackedUrl(
          parsed.companyWebsiteUrl,
          allowedUrls,
        ),
        directApplicationUrl: evidenceBackedUrl(
          parsed.directApplicationUrl,
          allowedUrls,
        ),
        applicationNote: parsed.applicationNote,
        interviewFocus: parsed.interviewFocus,
      });
      return null;
    } catch (error) {
      if (convexErrorCode(error) === "JOB_NO_LONGER_ACTIVE") throw error;
      await ctx.runMutation(internal.jobReviews.fail, {
        userId,
        reviewId: context.reviewId,
        requestId,
        errorCode: providerErrorCode(error),
      });
      throw new ConvexError({
        code: "JOB_REVIEW_FAILED",
        category: providerErrorCode(error),
      });
    }
  },
});
