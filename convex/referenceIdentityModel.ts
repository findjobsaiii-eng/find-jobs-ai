import { v, type Infer } from "convex/values";

export const identityCatalogValidator = v.object({
  skills: v.record(v.string(), v.string()),
  fields: v.record(v.string(), v.string()),
  qualifications: v.record(v.string(), v.string()),
});
export type IdentityCatalog = Infer<typeof identityCatalogValidator>;

export function identityTermKey(normalizedTerm: string) {
  // Convex object keys must be ASCII; aliases include Hebrew and punctuation.
  return (
    "t:" +
    normalizedTerm
      .split("")
      .map((char) => char.charCodeAt(0).toString(16).padStart(4, "0"))
      .join("")
  );
}

export function normalizeEducationTerm(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u0591-\u05bd\u05bf-\u05c7]/gu, "")
    .replace(/["'\u2018\u2019\u201c\u201d\u05f3\u05f4]/gu, "")
    .replace(/[\u2010-\u2015-]/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

export function fieldKeysFromCatalog(
  catalog: IdentityCatalog,
  ...values: Array<string | null>
) {
  const text =
    " " + normalizeEducationTerm(values.filter(Boolean).join(" ")) + " ";
  const found = new Set<string>();
  for (const [encodedAlias, key] of Object.entries(catalog.fields)) {
    const alias = (encodedAlias.slice(2).match(/.{4}/gu) ?? [])
      .map((hex) => String.fromCharCode(parseInt(hex, 16)))
      .join("");
    // Whole words only: CS must not match CSS; Hebrew inflections remain explicit aliases.
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    if (
      new RegExp(
        "(?:^|[^\\p{L}\\p{N}])" +
          (/[\u0590-\u05ff]/u.test(alias) ? "[בל]?" : "") +
          escaped +
          "(?=$|[^\\p{L}\\p{N}])",
        "u",
      ).test(text)
    )
      found.add(key);
  }
  return [...found];
}

/** Collect only the subject, not a full employer requirement sentence. */
export function educationObservationTerms(requirements: readonly string[]) {
  return requirements.flatMap((requirement) => {
    const match = requirement.match(
      /(?:\b(?:degree|b\.?sc\.?|bachelor(?:['’]s)?(?: degree)?)\s+in\s+|תואר\s+(?:(?:ראשון|שני|אקדמי)\s+)?ב)(.+)/iu,
    );
    if (!match) return [];
    const subject = match[1]
      .split(
        /\b(?:required|mandatory|preferred|or equivalent|with)\b|\s[-–—]\s|חובה|יתרון|או ניסיון/iu,
      )[0]
      .trim()
      .replace(/[.,;:]$/u, "");
    if (!subject || /\bor\b|(?:^|\s)או(?:\s|$)|\d/u.test(subject)) return [];
    return [subject];
  });
}
