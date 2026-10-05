import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { findPublicSkillCatalogItem } from "./skillIdentity";

export function normalizeCatalogLabel(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("en-US");
}

/** Only confirmed aliases or exact labels establish equivalence. */
export async function findPublicCatalogItem(
  ctx: QueryCtx | MutationCtx,
  kind: Doc<"catalogItems">["kind"],
  label: string,
): Promise<Doc<"catalogItems"> | null> {
  if (kind === "skill") return findPublicSkillCatalogItem(ctx, label);
  const matches = await ctx.db
    .query("catalogItems")
    .withSearchIndex("search_catalog", (q) =>
      q
        .search("searchText", label)
        .eq("kind", kind)
        .eq("visibility", "public")
        .eq("active", true),
    )
    .take(40);
  const key = normalizeCatalogLabel(label);
  return matches.find((item) => item.normalizedLabels.includes(key)) ?? null;
}

export async function publicEquivalent(
  ctx: QueryCtx | MutationCtx,
  item: Doc<"catalogItems">,
) {
  if (item.visibility === "public") return item;
  for (const label of [item.labelEn, item.labelHe]) {
    if (!label) continue;
    const shared = await findPublicCatalogItem(ctx, item.kind, label);
    if (shared) return shared;
  }
  return item;
}

export async function canonicalCatalogIds(
  ctx: QueryCtx | MutationCtx,
  ids: Id<"catalogItems">[],
  userId: Id<"users">,
) {
  const canonical = await Promise.all(
    ids.map(async (id) => {
      const item = await ctx.db.get("catalogItems", id);
      // Never resolve another owner's private reference on their behalf.
      if (
        !item ||
        (item.visibility === "private" && item.ownerUserId !== userId)
      )
        return id;
      return (await publicEquivalent(ctx, item))._id;
    }),
  );
  return [...new Set(canonical)];
}

async function repairReferences(
  ctx: MutationCtx,
  row: Doc<"candidateProfiles"> | Doc<"resumeDocuments">,
  table: "candidateProfiles" | "resumeDocuments",
) {
  const patch: {
    targetJobTitleIds?: Id<"catalogItems">[];
    skillIds?: Id<"catalogItems">[];
  } = {};
  let replaced = 0;
  for (const field of ["targetJobTitleIds", "skillIds"] as const) {
    const ids = row[field];
    if (!ids) continue;
    const canonical = await canonicalCatalogIds(ctx, ids, row.userId);
    if (JSON.stringify(ids) !== JSON.stringify(canonical)) {
      patch[field] = canonical;
      replaced += ids.filter((id, i) => canonical[i] !== id).length;
    }
  }
  if (replaced) {
    // Identity-only consolidation preserves the user's profile revision and preferences.
    await ctx.db.patch(table, row._id, patch);
  }
  return replaced;
}

/** Repair references before deleting redundant private rows; each transaction is bounded. */
export const reconcilePage = internalMutation({
  args: {
    phase: v.union(
      v.literal("profiles"),
      v.literal("resumes"),
      v.literal("private"),
    ),
    cursor: v.union(v.string(), v.null()),
    scheduleNext: v.optional(v.boolean()),
  },
  returns: v.object({
    replaced: v.number(),
    removed: v.number(),
    nextPhase: v.union(
      v.literal("profiles"),
      v.literal("resumes"),
      v.literal("private"),
      v.null(),
    ),
    nextCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, { phase, cursor, scheduleNext = true }) => {
    const opts = { cursor, numItems: 10 };
    let replaced = 0;
    let removed = 0;
    let isDone: boolean;
    let continueCursor: string;
    if (phase === "private") {
      const page = await ctx.db
        .query("catalogItems")
        .withIndex("by_source_and_externalId", (q) => q.eq("source", "user"))
        .paginate(opts);
      ({ isDone, continueCursor } = page);
      for (const item of page.page) {
        if (item.visibility !== "private" || !item.ownerUserId) continue;
        const shared = await publicEquivalent(ctx, item);
        if (shared._id === item._id) continue;
        // A concurrent onboarding import can copy a cached resume's IDs. Recheck
        // the owner's latest profile in the same transaction as deletion.
        const profile = await ctx.db
          .query("candidateProfiles")
          .withIndex("by_userId", (q) => q.eq("userId", item.ownerUserId!))
          .unique();
        if (profile)
          replaced += await repairReferences(ctx, profile, "candidateProfiles");
        await ctx.db.delete("catalogItems", item._id);
        removed++;
      }
    } else if (phase === "profiles") {
      const page = await ctx.db
        .query("candidateProfiles")
        .withIndex("by_userId")
        .paginate(opts);
      ({ isDone, continueCursor } = page);
      for (const row of page.page)
        replaced += await repairReferences(ctx, row, "candidateProfiles");
    } else {
      const page = await ctx.db
        .query("resumeDocuments")
        .withIndex("by_userId_and_createdAt")
        .paginate(opts);
      ({ isDone, continueCursor } = page);
      for (const row of page.page)
        replaced += await repairReferences(ctx, row, "resumeDocuments");
    }
    const nextPhase = isDone
      ? phase === "profiles"
        ? "resumes"
        : phase === "resumes"
          ? "private"
          : null
      : phase;
    const nextCursor = isDone ? null : continueCursor;
    if (scheduleNext && nextPhase)
      await ctx.scheduler.runAfter(
        0,
        internal.catalogReconciliation.reconcilePage,
        {
          phase: nextPhase,
          cursor: nextCursor,
        },
      );
    if (replaced || removed)
      console.info("Catalog consolidation", { phase, replaced, removed });
    return { replaced, removed, nextPhase, nextCursor };
  },
});
