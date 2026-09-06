import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { CATALOG_SEED } from "./referenceCatalogData";

const catalogKindValidator = v.union(v.literal("jobTitle"), v.literal("skill"));

const catalogOptionValidator = v.object({
  id: v.id("catalogItems"),
  labelEn: v.union(v.string(), v.null()),
  labelHe: v.union(v.string(), v.null()),
  isCustom: v.boolean(),
});

const locationOptionValidator = v.object({
  code: v.string(),
  nameEn: v.union(v.string(), v.null()),
  nameHe: v.string(),
  kind: v.union(
    v.literal("locality"),
    v.literal("region"),
    v.literal("nationwide"),
  ),
});

const CUSTOM_LIMITS = {
  jobTitle: { maxItems: 10, minLength: 2, maxLength: 80 },
  skill: { maxItems: 50, minLength: 1, maxLength: 50 },
} as const;

function normalizeWhitespace(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

function normalizedKey(value: string) {
  return normalizeWhitespace(value).toLocaleLowerCase("en-US");
}

function normalizeSearch(value: string) {
  const normalized = normalizeWhitespace(value);
  if (normalized.length > 80) {
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
    const search = normalizeSearch(args.search);

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
          .take(12)
      : await ctx.db
          .query("catalogItems")
          .withIndex("by_kind_and_visibility_and_active_and_priority", (q) =>
            q
              .eq("kind", args.kind)
              .eq("visibility", "public")
              .eq("active", true),
          )
          .order("desc")
          .take(12);

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
          .take(8)
      : await ctx.db
          .query("catalogItems")
          .withIndex("by_ownerUserId_and_kind_and_normalizedKey", (q) =>
            q.eq("ownerUserId", userId).eq("kind", args.kind),
          )
          .take(8)
          .then((items) => items.filter((item) => item.active));

    return [...privateItems, ...publicItems].map(toCatalogOption);
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
      /[\p{Cc}\p{Cf}]/u.test(label)
    ) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        field: args.kind === "jobTitle" ? "targetJobTitles" : "skills",
        reason: "custom_item",
      });
    }

    const key = normalizedKey(label);
    const likelyPublicMatches = await ctx.db
      .query("catalogItems")
      .withSearchIndex("search_catalog", (q) =>
        q
          .search("searchText", label)
          .eq("kind", args.kind)
          .eq("visibility", "public")
          .eq("active", true),
      )
      .take(20);
    const publicMatch = likelyPublicMatches.find((item) =>
      item.normalizedLabels.includes(key),
    );
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

export const searchLocations = query({
  args: { search: v.string() },
  returns: v.array(locationOptionValidator),
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const search = normalizeSearch(args.search);
    const locations = search
      ? await ctx.db
          .query("locations")
          .withSearchIndex("search_locations", (q) =>
            q.search("searchText", search).eq("active", true),
          )
          .take(20)
      : await ctx.db
          .query("locations")
          .withIndex("by_active_and_priority", (q) => q.eq("active", true))
          .order("desc")
          .take(15);
    return locations.map((location) => ({
      code: location.code,
      nameEn: location.nameEn ?? null,
      nameHe: location.nameHe,
      kind: location.kind,
    }));
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
      const labels = [item.labelEn, item.labelHe, ...(item.aliases ?? [])];
      const normalizedLabels = [...new Set(labels.map(normalizedKey))];
      const values = {
        kind: item.kind,
        labelEn: item.labelEn,
        labelHe: item.labelHe,
        normalizedKey: normalizedKey(item.labelEn),
        normalizedLabels,
        searchText: labels.join(" "),
        visibility: "public" as const,
        source: "curated" as const,
        externalId: item.slug,
        priority: item.priority,
        active: true,
        updatedAt: Date.now(),
      };
      const existing = await ctx.db
        .query("catalogItems")
        .withIndex("by_source_and_externalId", (q) =>
          q.eq("source", "curated").eq("externalId", item.slug),
        )
        .unique();
      if (existing) {
        await ctx.db.patch("catalogItems", existing._id, values);
        updated += 1;
      } else {
        await ctx.db.insert("catalogItems", {
          ...values,
          createdAt: Date.now(),
        });
        inserted += 1;
      }
    }
    return { inserted, updated, total: CATALOG_SEED.length };
  },
});
