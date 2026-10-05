import { internal } from "./_generated/api";
import {
  findPublicCatalogItem,
  publicEquivalent,
} from "./catalogReconciliation";
import { seedEducationCatalog } from "./referenceIdentity";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { CATALOG_SEED } from "./referenceCatalogData";
import {
  findPublicSkillCatalogItem,
  normalizeSkillTerm,
  resolveSkillIdentity,
  upsertSkillCatalogItem,
} from "./skillIdentity";

const catalogKindValidator = v.union(
  v.literal("jobTitle"),
  v.literal("skill"),
  v.literal("experienceDomain"),
);

const catalogOptionValidator = v.object({
  id: v.id("catalogItems"),
  labelEn: v.union(v.string(), v.null()),
  labelHe: v.union(v.string(), v.null()),
  isCustom: v.boolean(),
});

const CUSTOM_LIMITS = {
  jobTitle: { maxItems: 10, minLength: 2, maxLength: 80 },
  skill: { maxItems: 50, minLength: 1, maxLength: 50 },
  experienceDomain: { maxItems: 50, minLength: 2, maxLength: 160 },
} as const;

function normalizeWhitespace(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

function normalizedKey(value: string) {
  return normalizeWhitespace(value).toLocaleLowerCase("en-US");
}

function normalizeSearch(value: string, max = 80) {
  const normalized = normalizeWhitespace(value);
  if (normalized.length > max) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      field: "search",
      reason: "length",
    });
  }
  return normalized;
}

async function requireUserId(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError({ code: "UNAUTHENTICATED" });
  return userId;
}

function toCatalogOption(item: {
  _id: Id<"catalogItems">;
  labelEn?: string;
  labelHe?: string;
  visibility: "public" | "private";
}) {
  return {
    id: item._id,
    labelEn: item.labelEn ?? null,
    labelHe: item.labelHe ?? null,
    isCustom: item.visibility === "private",
  };
}

export const searchCatalog = query({
  args: {
    kind: catalogKindValidator,
    search: v.string(),
  },
  returns: v.array(catalogOptionValidator),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const search = normalizeSearch(
      args.search,
      args.kind === "experienceDomain" ? 160 : 80,
    );

    const publicItems = search
      ? await ctx.db
          .query("catalogItems")
          .withSearchIndex("search_catalog", (q) =>
            q
              .search("searchText", search)
              .eq("kind", args.kind)
              .eq("visibility", "public")
              .eq("active", true),
          )
          .take(30)
      : await ctx.db
          .query("catalogItems")
          .withIndex("by_kind_and_visibility_and_active_and_priority", (q) =>
            q
              .eq("kind", args.kind)
              .eq("visibility", "public")
              .eq("active", true),
          )
          .order("desc")
          .take(30);

    const privateItems = search
      ? await ctx.db
          .query("catalogItems")
          .withSearchIndex("search_catalog", (q) =>
            q
              .search("searchText", search)
              .eq("kind", args.kind)
              .eq("visibility", "private")
              .eq("ownerUserId", userId)
              .eq("active", true),
          )
          .take(20)
      : await ctx.db
          .query("catalogItems")
          .withIndex("by_ownerUserId_and_kind_and_normalizedKey", (q) =>
            q.eq("ownerUserId", userId).eq("kind", args.kind),
          )
          .take(20)
          .then((items) => items.filter((item) => item.active));

    const exactSkill =
      args.kind === "skill" && search
        ? await findPublicSkillCatalogItem(ctx, search)
        : null;
    const ordered = [
      ...(exactSkill ? [exactSkill] : []),
      ...(await Promise.all(
        privateItems.map((item) => publicEquivalent(ctx, item)),
      )),
      ...publicItems,
    ];
    return [...new Map(ordered.map((item) => [item._id, item])).values()].map(
      toCatalogOption,
    );
  },
});

export const addCustomCatalogItem = mutation({
  args: {
    kind: catalogKindValidator,
    label: v.string(),
    locale: v.union(v.literal("en"), v.literal("he")),
  },
  returns: catalogOptionValidator,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const limits = CUSTOM_LIMITS[args.kind];
    const label = normalizeWhitespace(args.label);
    if (
      label.length < limits.minLength ||
      label.length > limits.maxLength ||
      /https?:\/\/|www\./iu.test(label) ||
      /[\p{Cc}\p{Cf}]/u.test(label) ||
      (args.kind === "experienceDomain" && /@/u.test(label))
    ) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        field:
          args.kind === "jobTitle"
            ? "targetJobTitles"
            : args.kind === "skill"
              ? "skills"
              : "experienceDomains",
        reason: "custom_item",
      });
    }

    const key =
      args.kind === "skill" ? normalizeSkillTerm(label) : normalizedKey(label);
    const publicMatch = await findPublicCatalogItem(ctx, args.kind, label);
    if (publicMatch) return toCatalogOption(publicMatch);

    const existing = await ctx.db
      .query("catalogItems")
      .withIndex("by_ownerUserId_and_kind_and_normalizedKey", (q) =>
        q
          .eq("ownerUserId", userId)
          .eq("kind", args.kind)
          .eq("normalizedKey", key),
      )
      .unique();
    if (existing) return toCatalogOption(existing);

    const customItems = await ctx.db
      .query("catalogItems")
      .withIndex("by_ownerUserId_and_kind_and_normalizedKey", (q) =>
        q.eq("ownerUserId", userId).eq("kind", args.kind),
      )
      .take(limits.maxItems + 1);
    if (customItems.length >= limits.maxItems) {
      throw new ConvexError({ code: "CUSTOM_ITEM_LIMIT" });
    }

    const now = Date.now();
    if (args.kind === "skill") {
      const id = await upsertSkillCatalogItem(ctx, userId, label, args.locale);
      const item = id ? await ctx.db.get("catalogItems", id) : null;
      if (!item) throw new Error("Skill creation failed");
      return toCatalogOption(item);
    }
    const id = await ctx.db.insert("catalogItems", {
      kind: args.kind,
      labelEn: args.locale === "en" ? label : undefined,
      labelHe: args.locale === "he" ? label : undefined,
      normalizedKey: key,
      normalizedLabels: [key],
      searchText: label,
      visibility: "private",
      ownerUserId: userId,
      source: "user",
      priority: 0,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const created = await ctx.db.get("catalogItems", id);
    if (!created) throw new Error("Catalog item creation failed");
    return toCatalogOption(created);
  },
});

export const seedCatalog = internalMutation({
  args: {},
  returns: v.object({
    inserted: v.number(),
    updated: v.number(),
    total: v.number(),
  }),
  handler: async (ctx) => {
    let inserted = 0;
    let updated = 0;
    for (const item of CATALOG_SEED) {
      const seededBySlug = await ctx.db
        .query("catalogItems")
        .withIndex("by_source_and_externalId", (q) =>
          q.eq("source", "curated").eq("externalId", item.slug),
        )
        .unique();
      const seeded =
        seededBySlug ??
        (item.kind === "skill"
          ? await findPublicSkillCatalogItem(ctx, item.labelEn)
          : null);
      const retainedAliases = [
        ...new Set([...(seeded?.aliases ?? []), ...(item.aliases ?? [])]),
      ];
      const labels = [item.labelEn, item.labelHe, ...retainedAliases];
      const normalizedLabels = [...new Set(labels.map(normalizedKey))];
      const values = {
        kind: item.kind,
        labelEn: item.labelEn,
        labelHe: item.labelHe,
        normalizedKey: normalizedKey(item.labelEn),
        normalizedLabels,
        aliases: retainedAliases,
        conceptKey:
          item.kind === "skill"
            ? resolveSkillIdentity(item.labelEn).key
            : undefined,
        searchText: labels.join(" "),
        visibility: "public" as const,
        source: "curated" as const,
        externalId: item.slug,
        priority: item.priority,
        active: true,
        updatedAt: Date.now(),
      };
      const existing = seeded;
      let catalogItemId: Id<"catalogItems">;
      if (existing) {
        await ctx.db.patch("catalogItems", existing._id, values);
        updated += 1;
        catalogItemId = existing._id;
      } else {
        catalogItemId = await ctx.db.insert("catalogItems", {
          ...values,
          createdAt: Date.now(),
        });
        inserted += 1;
      }
      if (item.kind === "skill") {
        const conceptKey = resolveSkillIdentity(item.labelEn).key;
        const existingAliases = await ctx.db
          .query("catalogSkillAliases")
          .withIndex("by_conceptKey", (q) =>
            q.eq("conceptKey", seeded?.conceptKey ?? conceptKey),
          )
          .take(80);
        const normalizedTerms = [...new Set(labels.map(normalizeSkillTerm))];
        for (const alias of existingAliases) {
          if (!normalizedTerms.includes(alias.normalizedTerm)) {
            await ctx.db.delete("catalogSkillAliases", alias._id);
          }
        }
        for (const normalizedTerm of normalizedTerms) {
          const alias = await ctx.db
            .query("catalogSkillAliases")
            .withIndex("by_normalizedTerm", (q) =>
              q.eq("normalizedTerm", normalizedTerm),
            )
            .unique();
          if (
            alias &&
            alias.conceptKey !== conceptKey &&
            alias.catalogItemId !== catalogItemId
          )
            throw new Error(`Conflicting skill alias: ${normalizedTerm}`);
          const aliasValues = { normalizedTerm, conceptKey, catalogItemId };
          if (alias)
            await ctx.db.patch("catalogSkillAliases", alias._id, aliasValues);
          else await ctx.db.insert("catalogSkillAliases", aliasValues);
        }
      }
    }
    await seedEducationCatalog(ctx);
    await ctx.scheduler.runAfter(
      0,
      internal.catalogReconciliation.reconcilePage,
      {
        phase: "profiles",
        cursor: null,
      },
    );
    return { inserted, updated, total: CATALOG_SEED.length };
  },
});

// Experience areas are saved as user-chosen strings, so classify the exact
// selected labels independently of the current dropdown search and locale.
export const classifyExperienceDomains = query({
  args: { labels: v.array(v.string()) },
  returns: v.array(v.object({ label: v.string(), isCustom: v.boolean() })),
  handler: async (ctx, { labels }) => {
    await requireUserId(ctx);
    if (labels.length > 20 || labels.some((label) => label.length > 160))
      throw new ConvexError({ code: "INVALID_SEARCH" });
    return Promise.all(
      labels.map(async (label) => ({
        label,
        isCustom: !(await findPublicCatalogItem(
          ctx,
          "experienceDomain",
          label,
        )),
      })),
    );
  },
});
