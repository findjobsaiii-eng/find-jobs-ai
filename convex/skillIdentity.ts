import {
  normalizeEducationTerm,
  identityTermKey,
  type IdentityCatalog,
} from "./referenceIdentityModel";
import { CATALOG_SEED } from "./referenceCatalogData";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

// Reused inside existing extraction calls. No model call is made for matching.
export const SKILL_IDENTITY_EXTRACTION_GUIDE =
  "Use precise conventional English skill names when equivalence is clear (JS → JavaScript, ReactJS → React, כושר ביטוי/כושר התבטאות → Verbal Communication). Keep interpersonal communication, verbal communication, written communication and public speaking separate. Keep Java/JavaScript and React/React Native separate. Preserve unfamiliar or ambiguous wording; do not infer a broader, related or unmentioned skill.";

export type SkillIdentity = {
  key: string;
  known: boolean;
  labelEn?: string;
  labelHe?: string;
};

/** Preserve significant technology punctuation: C, C# and C++ are different. */
export function normalizeSkillTerm(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u0591-\u05bd\u05bf-\u05c7]/gu, "")
    .replace(/[\u2010-\u2015]/gu, "-")
    .replace(/[\u2018\u2019\u05f3]/gu, "'")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("en-US");
}

const identities = new Map<string, SkillIdentity>();
for (const skill of CATALOG_SEED) {
  if (skill.kind !== "skill") continue;
  const identity: SkillIdentity = {
    key: `skill:${skill.slug}`,
    known: true,
    labelEn: skill.labelEn,
    labelHe: skill.labelHe,
  };
  for (const term of [skill.labelEn, skill.labelHe, ...(skill.aliases ?? [])]) {
    const normalized = normalizeSkillTerm(term);
    const previous = identities.get(normalized);
    if (previous && previous.key !== identity.key) {
      throw new Error(`Conflicting skill alias: ${term}`);
    }
    identities.set(normalized, identity);
  }
}

// Match the lexicon in one pass rather than scanning each sentence once per
// alias. Longer alternatives preserve React Native and other composite skills.
const skillMentionPattern = new RegExp(
  `(?<![\\p{L}\\p{N}+#.])(?:${[...identities.keys()]
    .filter((term) => term.length >= 2)
    .sort((a, b) => b.length - a.length)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
    .join("|")})(?![\\p{L}\\p{N}+#.])`,
  "gu",
);
const mentionCache = new Map<string, string[]>();

/** Exact named skills in prose; longest overlapping alias wins (React Native, C++). */
export function namedSkillsInText(value: string) {
  const text = normalizeSkillTerm(value);
  const cached = mentionCache.get(text);
  if (cached) return cached;
  const names = [
    ...new Set(
      [...text.matchAll(skillMentionPattern)].map(
        (match) => identities.get(match[0])!.labelEn!,
      ),
    ),
  ];
  if (mentionCache.size >= 500) mentionCache.clear();
  mentionCache.set(text, names);
  return names;
}

/** Unknown terms retain their meaning; similarity never proves equivalence. */
export function resolveSkillIdentity(
  term: string,
  catalog?: IdentityCatalog,
): SkillIdentity {
  const normalized = normalizeSkillTerm(term);
  if (catalog) {
    const key =
      catalog.skills[identityTermKey(normalized)] ??
      catalog.qualifications[identityTermKey(normalizeEducationTerm(term))];
    return key
      ? { key, known: true }
      : { key: `term:${normalized}`, known: false };
  }
  return (
    identities.get(normalized) ?? { key: `term:${normalized}`, known: false }
  );
}

export function canonicalSkillKeys(terms: readonly string[]): string[] {
  return [
    ...new Set(
      terms
        .filter((term) => normalizeSkillTerm(term))
        .map((term) => resolveSkillIdentity(term).key),
    ),
  ];
}

export function skillsEquivalent(
  left: string,
  right: string,
  catalog?: IdentityCatalog,
): boolean {
  if (!normalizeSkillTerm(left) || !normalizeSkillTerm(right)) return false;
  return (
    resolveSkillIdentity(left, catalog).key ===
    resolveSkillIdentity(right, catalog).key
  );
}

export async function findPublicSkillCatalogItem(
  ctx: QueryCtx | MutationCtx,
  term: string,
): Promise<Doc<"catalogItems"> | null> {
  const normalizedTerm = normalizeSkillTerm(term);
  const alias = await ctx.db
    .query("catalogSkillAliases")
    .withIndex("by_normalizedTerm", (q) =>
      q.eq("normalizedTerm", normalizedTerm),
    )
    .unique();
  if (!alias) return null;
  const item = await ctx.db.get("catalogItems", alias.catalogItemId);
  return item?.kind === "skill" && item.active && item.visibility === "public"
    ? item
    : null;
}

/** Unknown entries stay private; the stable term key can still match a job. */
export async function upsertSkillCatalogItem(
  ctx: MutationCtx,
  userId: Id<"users">,
  label: string,
  locale?: "en" | "he",
): Promise<Id<"catalogItems"> | null> {
  const clean = label
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .slice(0, 50);
  if (!clean || /https?:\/\/|www\.|[\p{Cc}\p{Cf}]/iu.test(clean)) return null;
  const publicItem = await findPublicSkillCatalogItem(ctx, clean);
  if (publicItem) return publicItem._id;
  const key = normalizeSkillTerm(clean);
  const owned = await ctx.db
    .query("catalogItems")
    .withIndex("by_ownerUserId_and_kind_and_normalizedKey", (q) =>
      q.eq("ownerUserId", userId).eq("kind", "skill").eq("normalizedKey", key),
    )
    .unique();
  if (owned) return owned._id;
  const now = Date.now();
  const language = locale ?? (/[\u0590-\u05ff]/u.test(clean) ? "he" : "en");
  return await ctx.db.insert("catalogItems", {
    kind: "skill",
    ...(language === "he" ? { labelHe: clean } : { labelEn: clean }),
    normalizedKey: key,
    conceptKey: resolveSkillIdentity(clean).key,
    normalizedLabels: [key],
    searchText: clean,
    visibility: "private",
    ownerUserId: userId,
    source: "user",
    priority: 0,
    active: true,
    createdAt: now,
    updatedAt: now,
  });
}
