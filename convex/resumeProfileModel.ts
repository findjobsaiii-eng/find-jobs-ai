import { z } from "zod";
import { resolveJobGeography } from "./jobGeography";

const confidence = z.enum(["high", "medium", "low"]);
const nullableText = z.string().nullable();

const roleSchema = z.object({
  jobTitle: z.string(),
  normalizedTitle: z.string(),
  company: z.string(),
  startDate: nullableText,
  endDate: nullableText,
  current: z.boolean(),
  responsibilities: z.array(z.string()),
  achievements: z.array(z.string()),
  technologies: z.array(z.string()),
  domain: nullableText,
  dateConfidence: confidence,
});

export const resumeExtractionSchema = z.object({
  currentTitle: nullableText,
  normalizedCurrentTitle: nullableText,
  professionalDomain: nullableText,
  seniority: z.enum(["entry", "mid", "senior", "lead", "executive", "unknown"]),
  summary: nullableText,
  roles: z.array(roleSchema),
  skills: z.object({
    technical: z.array(z.string()),
    platforms: z.array(z.string()),
    tools: z.array(z.string()),
    business: z.array(z.string()),
    ecommerce: z.array(z.string()),
    productProject: z.array(z.string()),
    marketingDigital: z.array(z.string()),
    management: z.array(z.string()),
  }),
  education: z.array(
    z.object({
      institution: z.string(),
      field: nullableText,
      credential: nullableText,
      startDate: nullableText,
      endDate: nullableText,
    }),
  ),
  languages: z.array(
    z.object({ language: z.string(), proficiency: nullableText }),
  ),
  location: z
    .object({ city: nullableText, country: nullableText, raw: z.string() })
    .nullable(),
  targetRoles: z.array(
    z.object({ title: z.string(), reason: z.string(), confidence }),
  ),
  confidence: z.object({
    currentTitle: confidence,
    location: confidence,
    dates: confidence,
    targetRoles: confidence,
  }),
});

export type ResumeExtraction = z.infer<typeof resumeExtractionSchema>;

const SKILL_ALIASES: Record<string, string> = {
  shopify: "Shopify",
  "shopify plus": "Shopify Plus",
  woocommerce: "WooCommerce",
  "woo commerce": "WooCommerce",
  javascript: "JavaScript",
  typescript: "TypeScript",
  reactjs: "React",
  "react js": "React",
  html: "HTML",
  css: "CSS",
};

export function normalizeLabel(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

function key(value: string) {
  return normalizeLabel(value)
    .toLocaleLowerCase("en-US")
    .replace(/[._-]+/gu, " ")
    .replace(/\s+/gu, " ");
}

export function normalizeSkill(value: string) {
  const normalized = normalizeLabel(value);
  return SKILL_ALIASES[key(normalized)] ?? normalized;
}

function unique(values: string[], limit: number, skill = false) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = skill ? normalizeSkill(raw) : normalizeLabel(raw);
    const normalizedKey = key(value);
    if (!value || seen.has(normalizedKey)) continue;
    seen.add(normalizedKey);
    result.push(value.slice(0, 200));
    if (result.length === limit) break;
  }
  return result;
}

function monthIndex(value: string | null) {
  if (!value) return null;
  const match = /^(\d{4})(?:-(\d{1,2}))?/u.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2] ?? 1);
  if (year < 1950 || year > 2200 || month < 1 || month > 12) return null;
  return year * 12 + month - 1;
}

function mergedMonths(intervals: Array<[number, number]>) {
  const sorted = intervals.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let current: [number, number] | null = null;
  for (const interval of sorted) {
    if (!current) current = [...interval];
    else if (interval[0] <= current[1] + 1)
      current[1] = Math.max(current[1], interval[1]);
    else {
      total += current[1] - current[0] + 1;
      current = [...interval];
    }
  }
  return total + (current ? current[1] - current[0] + 1 : 0);
}

export function normalizeResumeExtraction(
  input: ResumeExtraction,
  now = new Date(),
) {
  const currentMonth = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const roles = input.roles.slice(0, 30).map((role) => {
    const start = monthIndex(role.startDate);
    const end = role.current ? currentMonth : monthIndex(role.endDate);
    const durationMonths =
      start !== null && end !== null && end >= start ? end - start + 1 : null;
    return {
      ...role,
      jobTitle: normalizeLabel(role.jobTitle).slice(0, 200),
      normalizedTitle: normalizeLabel(role.normalizedTitle).slice(0, 200),
      company: normalizeLabel(role.company).slice(0, 200),
      responsibilities: unique(role.responsibilities, 20),
      achievements: unique(role.achievements, 20),
      technologies: unique(role.technologies, 30, true),
      domain: role.domain ? normalizeLabel(role.domain).slice(0, 120) : null,
      durationMonths,
    };
  });
  const intervals = roles.flatMap((role) => {
    const start = monthIndex(role.startDate);
    const end = role.current ? currentMonth : monthIndex(role.endDate);
    return start !== null && end !== null && end >= start
      ? ([[start, end]] as Array<[number, number]>)
      : [];
  });
  const domainIntervals = new Map<string, Array<[number, number]>>();
  for (const role of roles) {
    if (!role.domain) continue;
    const start = monthIndex(role.startDate);
    const end = role.current ? currentMonth : monthIndex(role.endDate);
    if (start === null || end === null || end < start) continue;
    const domainKey = key(role.domain);
    domainIntervals.set(domainKey, [
      ...(domainIntervals.get(domainKey) ?? []),
      [start, end],
    ]);
  }
  const skillGroups = Object.fromEntries(
    Object.entries(input.skills).map(([group, values]) => [
      group,
      unique(values, 30, true),
    ]),
  ) as ResumeExtraction["skills"];
  const allSkills = unique(
    [
      ...Object.values(skillGroups).flat(),
      ...roles.flatMap((role) => role.technologies),
    ],
    50,
    true,
  );
  const targetRoles = input.targetRoles
    .filter((role) => normalizeLabel(role.title))
    .slice(0, 5)
    .map((role) => ({
      ...role,
      title: normalizeLabel(role.title).slice(0, 200),
      reason: normalizeLabel(role.reason).slice(0, 400),
    }));
  if (!targetRoles.length && input.normalizedCurrentTitle) {
    targetRoles.push({
      title: normalizeLabel(input.normalizedCurrentTitle),
      reason: "Most recent role",
      confidence: input.confidence.currentTitle,
    });
  }
  const geo = input.location
    ? resolveJobGeography({
        city: input.location.city,
        locationText: input.location.raw,
        country: input.location.country,
      })
    : undefined;
  return {
    ...input,
    currentTitle: input.currentTitle
      ? normalizeLabel(input.currentTitle)
      : null,
    normalizedCurrentTitle: input.normalizedCurrentTitle
      ? normalizeLabel(input.normalizedCurrentTitle)
      : null,
    professionalDomain: input.professionalDomain
      ? normalizeLabel(input.professionalDomain)
      : null,
    summary: input.summary
      ? normalizeLabel(input.summary).slice(0, 1_200)
      : null,
    roles,
    skills: skillGroups,
    allSkills,
    targetRoles,
    totalExperienceMonths: mergedMonths(intervals),
    experienceByDomain: [...domainIntervals.entries()].map(
      ([domain, domainRanges]) => ({
        domain,
        months: mergedMonths(domainRanges),
      }),
    ),
    normalizedLocation:
      geo && input.location
        ? {
            placeId: geo.placeId,
            formattedAddress: input.location.city ?? input.location.raw,
            city: input.location.city ?? undefined,
            country: input.location.country ?? "Israel",
            countryCode: geo.countryCode,
            latitude: geo.latitude,
            longitude: geo.longitude,
            radiusKm: 25,
          }
        : null,
  };
}
