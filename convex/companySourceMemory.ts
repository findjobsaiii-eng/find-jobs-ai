import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { normalizeCompanyIdentity } from "./jobDiscoveryModel";
import { isUserFacingJobSource } from "./jobSourceProvenance";

export async function rememberVerifiedCompanySource(
  ctx: MutationCtx,
  args: {
    job: Pick<Doc<"jobs">, "_id" | "companyName">;
    source: Pick<
      Doc<"jobSources">,
      "_id" | "domain" | "sourceTier" | "activityStatus" | "lastVerifiedAt"
    >;
  },
) {
  if (
    args.source.activityStatus !== "verified_active" ||
    !args.source.lastVerifiedAt ||
    (args.source.sourceTier !== "employer" && args.source.sourceTier !== "ats")
  ) {
    return false;
  }
  const normalizedCompany = normalizeCompanyIdentity(args.job.companyName);
  if (!normalizedCompany) return false;
  const existing = await ctx.db
    .query("companySourceMemory")
    .withIndex("by_normalizedCompany_and_domain", (q) =>
      q
        .eq("normalizedCompany", normalizedCompany)
        .eq("domain", args.source.domain),
    )
    .unique();
  const values = {
    normalizedCompany,
    domain: args.source.domain,
    sourceTier: args.source.sourceTier,
    evidenceJobId: args.job._id,
    evidenceSourceId: args.source._id,
    lastVerifiedAt: args.source.lastVerifiedAt,
  } as const;
  if (existing) await ctx.db.patch("companySourceMemory", existing._id, values);
  else {
    await ctx.db.insert("companySourceMemory", {
      ...values,
      firstVerifiedAt: args.source.lastVerifiedAt,
    });
  }
  return true;
}

export const backfillVerifiedCompanySources = internalMutation({
  args: { limit: v.number() },
  returns: v.object({ scanned: v.number(), remembered: v.number() }),
  handler: async (ctx, args) => {
    const sources = await ctx.db
      .query("jobSources")
      .withIndex("by_nextVerificationAt")
      .take(Math.min(Math.max(Math.floor(args.limit), 1), 200));
    let remembered = 0;
    for (const source of sources) {
      if (!isUserFacingJobSource(source)) continue;
      const job = await ctx.db.get("jobs", source.jobId);
      if (!job || job.canonicalJobId) continue;
      if (await rememberVerifiedCompanySource(ctx, { job, source })) {
        remembered += 1;
      }
    }
    return { scanned: sources.length, remembered };
  },
});
