import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import schema from "./schema";
import { normalizeSkillTerm } from "./skillIdentity";
import {
  normalizeEducationTerm,
  identityTermKey,
  fieldKeysFromCatalog,
  type IdentityCatalog,
} from "./referenceIdentityModel";
import { EDUCATION_CATALOG_SEED } from "./educationCatalogData";

export async function loadIdentityCatalog(
  ctx: QueryCtx | MutationCtx,
): Promise<IdentityCatalog> {
  const [skills, education] = await Promise.all([
    ctx.db
      .query("catalogSkillAliases")
      .withIndex("by_normalizedTerm")
      .take(901),
    ctx.db.query("educationConcepts").withIndex("by_kind").take(201),
  ]);
  if (skills.length > 900 || education.length > 200)
    throw new ConvexError({ code: "CATALOG_CAPACITY_REACHED" });
  const result: IdentityCatalog = {
    skills: {},
    fields: {},
    qualifications: {},
  };
  for (const row of skills)
    result.skills[identityTermKey(row.normalizedTerm)] = row.conceptKey;
  for (const row of education) {
    const target = row.kind === "field" ? result.fields : result.qualifications;
    for (const term of [row.labelEn, row.labelHe, ...row.aliases]) {
      const normalized = identityTermKey(normalizeEducationTerm(term));
      if (normalized.length > 1000)
        throw new ConvexError({ code: "INVALID_REFERENCE_ALIAS" });
      if (target[normalized] && target[normalized] !== row.key)
        throw new Error("Conflicting education alias");
      target[normalized] = row.key;
    }
  }
  if (
    Object.keys(result.fields).length > 900 ||
    Object.keys(result.qualifications).length > 900
  )
    throw new ConvexError({ code: "CATALOG_CAPACITY_REACHED" });
  return result;
}

export async function seedEducationCatalog(ctx: MutationCtx) {
  for (const item of EDUCATION_CATALOG_SEED) {
    const existing = await ctx.db
      .query("educationConcepts")
      .withIndex("by_key", (q) => q.eq("key", item.key))
      .unique();
    const aliases = [
      ...new Set([...(existing?.aliases ?? []), ...item.aliases]),
    ];
    const values = {
      key: item.key,
      kind: item.kind,
      labelEn: item.labelEn,
      labelHe: item.labelHe,
      aliases,
      searchText: [item.labelEn, item.labelHe, ...aliases].join(" "),
      updatedAt: Date.now(),
    };
    if (existing) await ctx.db.patch("educationConcepts", existing._id, values);
    else
      await ctx.db.insert("educationConcepts", {
        ...values,
        source: "seed",
        createdAt: Date.now(),
      });
  }
}

export async function observeReferenceTerms(
  ctx: MutationCtx,
  source: { key: string; userId?: Id<"users"> },
  terms: Array<{ kind: "skill" | "education"; term: string }>,
  suppliedCatalog?: IdentityCatalog,
) {
  const catalog = suppliedCatalog ?? (await loadIdentityCatalog(ctx));
  const seen = new Set<string>();
  for (const { kind, term: raw } of terms.slice(0, 60)) {
    const term = raw.normalize("NFKC").trim().replace(/\s+/gu, " ");
    if (
      term.length < 2 ||
      term.length > 160 ||
      /https?:|@|[\p{Cc}\p{Cf}]/iu.test(term)
    )
      continue;
    const normalizedTerm =
      kind === "skill"
        ? normalizeSkillTerm(term)
        : normalizeEducationTerm(term);
    if (seen.has(kind + ":" + normalizedTerm)) continue;
    seen.add(kind + ":" + normalizedTerm);
    if (
      kind === "education" &&
      (fieldKeysFromCatalog(catalog, term).length ||
        /^(?:b\.?sc\.?|b\.?a\.?|m\.?sc\.?|ph\.?d\.?|bachelor|master|doctorate|תואר ראשון|תואר שני)$/iu.test(
          term,
        ))
    )
      continue;
    if (
      kind === "skill"
        ? catalog.skills[identityTermKey(normalizedTerm)]
        : catalog.fields[identityTermKey(normalizedTerm)] ||
          catalog.qualifications[identityTermKey(normalizedTerm)]
    )
      continue;
    let candidate = await ctx.db
      .query("catalogTermCandidates")
      .withIndex("by_kind_and_normalizedTerm", (q) =>
        q.eq("kind", kind).eq("normalizedTerm", normalizedTerm),
      )
      .unique();
    if (!candidate) {
      const id = await ctx.db.insert("catalogTermCandidates", {
        kind,
        term,
        normalizedTerm,
        occurrenceCount: 0,
        status: "pending",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      candidate = await ctx.db.get("catalogTermCandidates", id);
    }
    if (!candidate || candidate.status !== "pending") continue;
    const occurrence = await ctx.db
      .query("catalogTermOccurrences")
      .withIndex("by_candidateId_and_sourceKey", (q) =>
        q.eq("candidateId", candidate._id).eq("sourceKey", source.key),
      )
      .unique();
    if (occurrence) continue;
    await ctx.db.insert("catalogTermOccurrences", {
      candidateId: candidate._id,
      sourceKey: source.key,
      ...(source.userId ? { userId: source.userId } : {}),
    });
    await ctx.db.patch("catalogTermCandidates", candidate._id, {
      occurrenceCount: candidate.occurrenceCount + 1,
      updatedAt: Date.now(),
    });
  }
}

export const searchEducation = query({
  args: { search: v.string() },
  returns: v.array(
    v.object({
      id: v.id("educationConcepts"),
      kind: v.union(v.literal("field"), v.literal("qualification")),
      labelEn: v.string(),
      labelHe: v.string(),
    }),
  ),
  handler: async (ctx, { search }) => {
    if (!(await getAuthUserId(ctx)))
      throw new ConvexError({ code: "UNAUTHENTICATED" });
    if (search.length > 160) throw new ConvexError({ code: "INVALID_SEARCH" });
    const clean = search.trim();
    const rows = clean
      ? await ctx.db
          .query("educationConcepts")
          .withSearchIndex("search_education", (q) =>
            q.search("searchText", clean),
          )
          .take(12)
      : await ctx.db.query("educationConcepts").withIndex("by_kind").take(12);
    return rows.map(({ _id, kind, labelEn, labelHe }) => ({
      id: _id,
      kind,
      labelEn,
      labelHe,
    }));
  },
});

async function requireCatalogAdmin(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  const membership = userId
    ? await ctx.db
        .query("adminMemberships")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique()
    : null;
  if (!membership?.active) throw new ConvexError({ code: "FORBIDDEN" });
}
export const listReview = query({
  args: {},
  returns: v.array(schema.doc("catalogTermCandidates")),
  handler: async (ctx) => {
    await requireCatalogAdmin(ctx);
    return await ctx.db
      .query("catalogTermCandidates")
      .withIndex("by_status_and_occurrenceCount", (q) =>
        q.eq("status", "review"),
      )
      .order("desc")
      .take(30);
  },
});

export async function applyCandidateProposal(
  ctx: MutationCtx,
  candidate: Doc<"catalogTermCandidates">,
) {
  const proposal = candidate.proposal;
  if (!proposal || (candidate.kind === "skill") !== (proposal.kind === "skill"))
    return false;
  const canonicalEn = proposal.canonicalEn.trim();
  const canonicalHe = proposal.canonicalHe.trim();
  if (
    !canonicalEn ||
    !canonicalHe ||
    canonicalEn.length > 100 ||
    canonicalHe.length > 100 ||
    /@|https?:|[\p{Cc}\p{Cf}]/iu.test(canonicalEn + canonicalHe)
  )
    return false;
  if (proposal.kind === "skill") {
    if (
      canonicalEn.length > 50 ||
      canonicalHe.length > 50 ||
      candidate.term.length > 50
    )
      return false;
    const canonicalTerm = normalizeSkillTerm(canonicalEn);
    const alias = await ctx.db
      .query("catalogSkillAliases")
      .withIndex("by_normalizedTerm", (q) =>
        q.eq("normalizedTerm", canonicalTerm),
      )
      .unique();
    let item = alias
      ? await ctx.db.get("catalogItems", alias.catalogItemId)
      : null;
    if (!item) {
      const now = Date.now();
      const id = await ctx.db.insert("catalogItems", {
        kind: "skill",
        labelEn: canonicalEn,
        labelHe: canonicalHe,
        normalizedKey: canonicalTerm,
        normalizedLabels: [canonicalTerm, normalizeSkillTerm(canonicalHe)],
        aliases: [],
        conceptKey: "skill:" + canonicalTerm,
        searchText: canonicalEn + " " + canonicalHe,
        visibility: "public",
        source: "curated",
        externalId: "learned:" + canonicalTerm,
        priority: 0,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      item = await ctx.db.get("catalogItems", id);
    }
    if (!item) return false;
    const conceptKey = item.conceptKey ?? alias?.conceptKey;
    if (!conceptKey) return false;
    const terms = [candidate.term, canonicalEn, canonicalHe];
    for (const term of terms) {
      const normalizedTerm = normalizeSkillTerm(term);
      const existing = await ctx.db
        .query("catalogSkillAliases")
        .withIndex("by_normalizedTerm", (q) =>
          q.eq("normalizedTerm", normalizedTerm),
        )
        .unique();
      if (existing && existing.conceptKey !== conceptKey) return false;
    }
    for (const term of terms) {
      const normalizedTerm = normalizeSkillTerm(term);
      const existing = await ctx.db
        .query("catalogSkillAliases")
        .withIndex("by_normalizedTerm", (q) =>
          q.eq("normalizedTerm", normalizedTerm),
        )
        .unique();
      if (!existing)
        await ctx.db.insert("catalogSkillAliases", {
          normalizedTerm,
          conceptKey,
          catalogItemId: item._id,
        });
    }
    const aliases = [...new Set([...(item.aliases ?? []), candidate.term])];
    if (aliases.length > 80) return false;
    await ctx.db.patch("catalogItems", item._id, {
      aliases,
      searchText: [item.labelEn, item.labelHe, ...aliases].join(" "),
      updatedAt: Date.now(),
    });
  } else {
    const catalog = await loadIdentityCatalog(ctx);
    const target =
      proposal.kind === "field" ? catalog.fields : catalog.qualifications;
    const key =
      target[identityTermKey(normalizeEducationTerm(canonicalEn))] ??
      proposal.kind + ":" + normalizeEducationTerm(canonicalEn);
    if (
      [
        candidate.normalizedTerm,
        normalizeEducationTerm(canonicalEn),
        normalizeEducationTerm(canonicalHe),
      ].some(
        (term) =>
          target[identityTermKey(term)] &&
          target[identityTermKey(term)] !== key,
      )
    )
      return false;
    const existing = await ctx.db
      .query("educationConcepts")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    const aliases = [
      ...new Set([...(existing?.aliases ?? []), candidate.term]),
    ];
    if (aliases.length > 80) return false;
    const values = {
      key,
      kind: proposal.kind,
      labelEn: existing?.labelEn ?? canonicalEn,
      labelHe: existing?.labelHe ?? canonicalHe,
      aliases,
      searchText: [
        existing?.labelEn ?? canonicalEn,
        existing?.labelHe ?? canonicalHe,
        ...aliases,
      ].join(" "),
      updatedAt: Date.now(),
    };
    if (existing) await ctx.db.patch("educationConcepts", existing._id, values);
    else
      await ctx.db.insert("educationConcepts", {
        ...values,
        source: "curation",
        createdAt: Date.now(),
      });
  }
  // Capacity/conflict checks happen inside the caller's subtransaction, so a
  // rejected proposal cannot leave partial public mappings behind.
  await loadIdentityCatalog(ctx);
  await ctx.db.patch("catalogTermCandidates", candidate._id, {
    status: "approved",
    updatedAt: Date.now(),
  });
  return true;
}

export const applyApprovedCandidate = internalMutation({
  args: { id: v.id("catalogTermCandidates") },
  returns: v.boolean(),
  handler: async (ctx, { id }) => {
    const candidate = await ctx.db.get("catalogTermCandidates", id);
    if (!candidate || candidate.status !== "review")
      throw new ConvexError({ code: "INVALID_CATALOG_PROPOSAL" });
    const applied = await applyCandidateProposal(ctx, candidate);
    if (!applied) throw new ConvexError({ code: "INVALID_CATALOG_PROPOSAL" });
    return true;
  },
});

export const decideCandidate = mutation({
  args: { id: v.id("catalogTermCandidates"), approve: v.boolean() },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    await requireCatalogAdmin(ctx);
    const candidate = await ctx.db.get("catalogTermCandidates", args.id);
    if (!candidate || candidate.status !== "review") return false;
    if (!args.approve) {
      await ctx.db.patch("catalogTermCandidates", candidate._id, {
        status: "rejected",
        updatedAt: Date.now(),
      });
      return true;
    }
    let applied = false;
    try {
      applied = await ctx.runMutation(
        internal.referenceIdentity.applyApprovedCandidate,
        { id: candidate._id },
      );
    } catch {
      return false;
    }
    if (applied)
      await ctx.scheduler.runAfter(
        0,
        internal.jobMatching.dispatchAllUsers,
        {},
      );
    return applied;
  },
});

export const claimMonthlyBatch = internalMutation({
  args: { period: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      runId: v.id("catalogCurationRuns"),
      candidates: v.array(schema.doc("catalogTermCandidates")),
      catalog: v.array(
        v.object({
          kind: v.string(),
          labelEn: v.string(),
          labelHe: v.string(),
        }),
      ),
    }),
  ),
  handler: async (ctx, { period }) => {
    if (
      await ctx.db
        .query("catalogCurationRuns")
        .withIndex("by_period", (q) => q.eq("period", period))
        .unique()
    )
      return null;
    const candidates = await ctx.db
      .query("catalogTermCandidates")
      .withIndex("by_status_and_occurrenceCount", (q) =>
        q.eq("status", "pending").gte("occurrenceCount", 3),
      )
      .order("desc")
      .take(30);
    if (!candidates.length) return null;
    const [skills, education] = await Promise.all([
      ctx.db
        .query("catalogItems")
        .withIndex("by_kind_and_visibility_and_active_and_priority", (q) =>
          q.eq("kind", "skill").eq("visibility", "public").eq("active", true),
        )
        .take(150),
      ctx.db.query("educationConcepts").withIndex("by_kind").take(200),
    ]);
    const runId = await ctx.db.insert("catalogCurationRuns", {
      period,
      status: "running",
      candidateIds: candidates.map((c) => c._id),
      startedAt: Date.now(),
    });
    return {
      runId,
      candidates,
      catalog: [
        ...skills.map((s) => ({
          kind: "skill",
          labelEn: s.labelEn ?? "",
          labelHe: s.labelHe ?? "",
        })),
        ...education.map((e) => ({
          kind: e.kind,
          labelEn: e.labelEn,
          labelHe: e.labelHe,
        })),
      ],
    };
  },
});

const proposalValidator = v.object({
  id: v.id("catalogTermCandidates"),
  kind: v.union(
    v.literal("skill"),
    v.literal("field"),
    v.literal("qualification"),
  ),
  canonicalEn: v.string(),
  canonicalHe: v.string(),
  confidence: v.number(),
  reason: v.string(),
  safeToPublish: v.boolean(),
  equivalent: v.boolean(),
});
export const finishMonthlyBatch = internalMutation({
  args: {
    runId: v.id("catalogCurationRuns"),
    proposals: v.array(proposalValidator),
    model: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get("catalogCurationRuns", args.runId);
    if (!run || run.status !== "running") return null;
    let approved = 0,
      review = 0;
    for (const id of run.candidateIds) {
      const candidate = await ctx.db.get("catalogTermCandidates", id);
      const matches = args.proposals.filter((p) => p.id === id);
      if (!candidate || candidate.status !== "pending" || matches.length !== 1)
        continue;
      const p = matches[0];
      if (
        !p.safeToPublish ||
        (candidate.kind === "skill") !== (p.kind === "skill")
      ) {
        await ctx.db.patch("catalogTermCandidates", id, {
          status: "rejected",
          updatedAt: Date.now(),
        });
        continue;
      }
      const proposal = {
        kind: p.kind,
        canonicalEn: p.canonicalEn,
        canonicalHe: p.canonicalHe,
        confidence: p.equivalent ? p.confidence : Math.min(p.confidence, 0.97),
        reason: p.reason.slice(0, 300),
      };
      await ctx.db.patch("catalogTermCandidates", id, {
        proposal,
        status: "review",
        updatedAt: Date.now(),
      });
      let applied = false;
      if (p.equivalent && p.confidence >= 0.98) {
        try {
          applied = await ctx.runMutation(
            internal.referenceIdentity.applyApprovedCandidate,
            { id },
          );
        } catch {
          /* Conflicts remain queued; the subtransaction rolls back. */
        }
      }
      if (applied) approved++;
      else review++;
    }
    await ctx.db.patch("catalogCurationRuns", run._id, {
      status: "completed",
      finishedAt: Date.now(),
      model: args.model,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      approved,
      review,
    });
    if (approved)
      await ctx.scheduler.runAfter(
        0,
        internal.jobMatching.dispatchAllUsers,
        {},
      );
    return null;
  },
});
export const failMonthlyBatch = internalMutation({
  args: { runId: v.id("catalogCurationRuns"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get("catalogCurationRuns", args.runId);
    if (run?.status === "running")
      await ctx.db.patch("catalogCurationRuns", run._id, {
        status: "failed",
        finishedAt: Date.now(),
        error: args.error.slice(0, 300),
      });
    return null;
  },
});

export const curationStatus = query({
  args: {},
  returns: v.object({
    pending: v.array(schema.doc("catalogTermCandidates")),
    runs: v.array(schema.doc("catalogCurationRuns")),
  }),
  handler: async (ctx) => {
    await requireCatalogAdmin(ctx);
    const [pending, runs] = await Promise.all([
      ctx.db
        .query("catalogTermCandidates")
        .withIndex("by_status_and_occurrenceCount", (q) =>
          q.eq("status", "pending"),
        )
        .order("desc")
        .take(30),
      ctx.db
        .query("catalogCurationRuns")
        .withIndex("by_period")
        .order("desc")
        .take(6),
    ]);
    return { pending, runs };
  },
});
