import { z } from "zod";
import { resolveJobGeography, type JobGeography } from "./jobGeography";
import { DISCOVERY_SOURCE_GUIDANCE } from "./jobSourceQuality";

export const JOB_DISCOVERY_LIMITS = {
  maxQueries: 5,
  maxJobsPerQuery: 10,
  maxJobsPerRun: 50,
  absoluteMaxOutputTokens: 6_000,
} as const;

const nullableShortText = z.string().max(300).nullable();
const nullableLongText = z.string().max(8_000).nullable();
const shortList = z.array(z.string().max(200)).max(20);

export const openAIJobSchema = z
  .object({
    title: z.string().max(200),
    companyName: z.string().max(200),
    sourceUrl: z.string().max(2_048),
    sourceName: nullableShortText,
    sourceType: z.enum(["employer", "ats", "job_board", "other"]),
    descriptionText: nullableLongText,
    requirementsText: nullableLongText,
    responsibilities: shortList,
    requiredSkills: shortList,
    preferredSkills: shortList,
    requiredExperienceYearsMin: z.number().int().min(0).max(80).nullable(),
    requiredExperienceYearsMax: z.number().int().min(0).max(80).nullable(),
    educationRequirements: shortList,
    languages: z.array(z.string().max(100)).max(10),
    country: nullableShortText,
    city: nullableShortText,
    locationText: nullableShortText,
    workArrangement: z.enum(["onsite", "hybrid", "remote", "unknown"]),
    employmentType: z.enum([
      "full-time",
      "part-time",
      "contract",
      "temporary",
      "internship",
      "unknown",
    ]),
    salaryMin: z.number().nonnegative().max(100_000_000).nullable(),
    salaryMax: z.number().nonnegative().max(100_000_000).nullable(),
    salaryCurrency: z.string().max(10).nullable(),
    salaryPeriod: z.enum(["hour", "day", "month", "year"]).nullable(),
    postedAt: z.string().max(50).nullable(),
    applicationDeadline: z.string().max(50).nullable(),
    workAuthorizationRequirements: nullableShortText,
    sourceEvidence: z
      .array(
        z
          .object({
            url: z.string().max(2_048),
            title: nullableShortText,
            excerpt: z.string().max(1_000).nullable(),
          })
          .strict(),
      )
      .max(10),
  })
  .strict();

export const openAIJobBatchSchema = z
  .object({
    jobs: z.array(openAIJobSchema).max(JOB_DISCOVERY_LIMITS.maxJobsPerQuery),
  })
  .strict();

export type OpenAIJob = z.infer<typeof openAIJobSchema>;

export type SearchProfile = {
  targetJobTitles: string[];
  targetRoleVariants?: Array<{ title: string; aliases: string[] }>;
  skills: string[];
  yearsOfExperience: number;
  location: {
    placeId: string;
    formattedAddress: string;
    city?: string;
    administrativeArea?: string;
    country: string;
    countryCode: string;
    latitude: number;
    longitude: number;
    radiusKm: number;
  };
  workArrangements: string[];
  employmentTypes: string[];
  languages: Array<{ languageCode: string; proficiency: string }>;
  minimumMonthlySalaryIls: number;
  normalizedPastRoles?: string[];
  currentRole?: string;
  seniority?: string;
  professionalDomains?: string[];
  experienceByDomain?: Array<{ domain: string; months: number }>;
};

export type NormalizedJob = OpenAIJob & {
  normalizedSourceUrl: string;
  canonicalKey: string;
  jobFingerprint: string;
  contentHash: string;
  rawProviderJson?: string;
  geo?: JobGeography;
};

export function hashText(value: string) {
  const seeds = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  return seeds
    .map((seed, seedIndex) => {
      let hash = seed;
      for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index) + seedIndex;
        hash = Math.imul(hash, 0x01000193);
      }
      return (hash >>> 0).toString(16).padStart(8, "0");
    })
    .join("");
}

function normalizeWhitespace(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

function normalizeIdentityText(value: string) {
  return normalizeWhitespace(value)
    .toLocaleLowerCase("en-US")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[’'`]/gu, "")
    .replace(/&/gu, " and ")
    .replace(/[^\p{L}\p{N}+#]+/gu, " ")
    .trim();
}

export function normalizeCompanyIdentity(value: string) {
  return normalizeIdentityText(value)
    .replace(/\b(?:incorporated|corporation|corp|limited|ltd|llc|plc)\b$/u, "")
    .replace(/\s+(?:בעמ|בע\s+מ)$/u, "")
    .trim();
}

export function normalizeTitleIdentity(value: string) {
  return normalizeIdentityText(value)
    .replace(/\be\s+commerce\b/gu, "ecommerce")
    .replace(/\bfront\s+end\b/gu, "frontend")
    .replace(/\bback\s+end\b/gu, "backend")
    .trim();
}

export function normalizedKey(value: string) {
  return normalizeWhitespace(value).toLocaleLowerCase("en-US");
}

function uniqueNormalized(values: string[], max: number) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeWhitespace(value);
    const key = normalizedKey(normalized);
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (result.length === max) break;
  }
  return result;
}

export function buildSearchPlan(profile: SearchProfile, maxQueries = 5) {
  const titles = uniqueNormalized(profile.targetJobTitles, 5).sort((a, b) =>
    normalizedKey(a).localeCompare(normalizedKey(b)),
  );
  const roleVariants = new Map(
    (profile.targetRoleVariants ?? []).map((role) => [
      normalizeTitleIdentity(role.title),
      role.aliases,
    ]),
  );
  const resolvedLocation = resolveJobGeography({
    city: profile.location.city ?? null,
    locationText: profile.location.formattedAddress,
    country: profile.location.country,
  });
  const radius = profile.location.radiusKm;
  const centralDistrict = ["Central District", "מרכז"];
  const telAvivDistrict = ["Tel Aviv District", "מחוז תל אביב"];
  const southernDistrict = ["Southern District", "דרום"];
  const northernDistrict = ["Northern District", "צפון"];
  const haifaDistrict = ["Haifa District", "מחוז חיפה"];
  const jerusalemDistrict = ["Jerusalem District", "מחוז ירושלים"];
  const districtAliases: Record<string, string[]> = {
    central: centralDistrict,
    center: centralDistrict,
    מרכז: centralDistrict,
    המרכז: centralDistrict,
    telaviv: telAvivDistrict,
    תלאביב: telAvivDistrict,
    southern: southernDistrict,
    south: southernDistrict,
    דרום: southernDistrict,
    הדרום: southernDistrict,
    northern: northernDistrict,
    north: northernDistrict,
    צפון: northernDistrict,
    הצפון: northernDistrict,
    haifa: haifaDistrict,
    חיפה: haifaDistrict,
    jerusalem: jerusalemDistrict,
    ירושלים: jerusalemDistrict,
  };
  const administrativeKey = normalizedKey(
    profile.location.administrativeArea ?? "",
  )
    .replace(/\b(?:district|מחוז)\b/gu, "")
    .replace(/[^\p{L}]+/gu, "")
    .trim();
  const locationScope =
    radius <= 25
      ? uniqueNormalized(
          [
            resolvedLocation?.labelEn ??
              profile.location.city ??
              profile.location.formattedAddress,
            resolvedLocation?.labelHe ?? "",
          ],
          2,
        )
      : radius <= 75
        ? (districtAliases[administrativeKey] ??
          uniqueNormalized(
            [
              profile.location.administrativeArea ?? "Central District",
              "Israel",
            ],
            2,
          ))
        : ["Israel", "ישראל"];
  const skills = uniqueNormalized(profile.skills, 5).filter(
    (skill) =>
      !/^(?:management|operations|digital|technology|website|ניהול|תפעול)$/iu.test(
        skill,
      ),
  );
  const alternatives = (values: string[]) =>
    `(${values.map((value) => `"${value.replace(/"/gu, "")}"`).join(" OR ")})`;
  const queryPlans = titles.slice(0, Math.min(maxQueries, 5)).map((title) => {
    const aliases = uniqueNormalized(
      [title, ...(roleVariants.get(normalizeTitleIdentity(title)) ?? [])],
      6,
    );
    const generatedQuery = normalizeWhitespace(
      `${alternatives(aliases)} ${skills.length ? alternatives(skills) : ""} ${alternatives(locationScope)} jobs. ${DISCOVERY_SOURCE_GUIDANCE}`,
    );
    // Sharing identity follows the real provider query so users with the same
    // role, skills, and geographic scope reuse one recent discovery run.
    const normalizedCriteria = JSON.stringify({
      role: normalizeTitleIdentity(title),
      aliases: aliases.map(normalizeTitleIdentity).sort(),
      skills: skills.map(normalizedKey).sort(),
      locationScope: locationScope.map(normalizedKey).sort(),
      radiusBand: radius <= 25 ? "city" : radius <= 75 ? "district" : "country",
      countryCode: profile.location.countryCode.toUpperCase(),
      coverageVersion: "israel_source_mix_v1",
    });
    return {
      generatedQuery,
      normalizedCriteria,
      fingerprint: hashText(normalizedCriteria),
    };
  });
  const generatedQueries = queryPlans.map((query) => query.generatedQuery);
  const normalizedCriteria = JSON.stringify(
    queryPlans.map((query) => query.normalizedCriteria),
  );
  return {
    normalizedCriteria,
    fingerprint: hashText(normalizedCriteria),
    generatedQueries,
    queryPlans,
  };
}

export function normalizePublicUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const hostname = url.hostname.toLocaleLowerCase("en-US");
  if (
    hostname === "localhost" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    /^127\./u.test(hostname) ||
    /^10\./u.test(hostname) ||
    /^192\.168\./u.test(hostname) ||
    /^169\.254\./u.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./u.test(hostname)
  ) {
    return null;
  }
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (
      /^(?:utm_.+|gclid|dclid|fbclid|msclkid|mc_(?:cid|eid)|ref(?:errer)?|referral|source|campaign|session(?:id)?|sid|trk|tracking_id|trackingId)$/iu.test(
        key,
      )
    ) {
      url.searchParams.delete(key);
    }
  }
  url.hostname = hostname.replace(/^www\./u, "");
  url.searchParams.sort();
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/u, "");
  return url.toString();
}

function nullableText(value: string | null, max: number) {
  if (value === null) return null;
  const normalized = normalizeWhitespace(value);
  return normalized ? normalized.slice(0, max) : null;
}

function normalizedList(values: string[], maxItems: number, maxLength: number) {
  return uniqueNormalized(values, maxItems).map((value) =>
    value.slice(0, maxLength),
  );
}

export function normalizeJob(
  candidate: unknown,
  providerSourceUrls: ReadonlySet<string>,
): NormalizedJob | null {
  const parsed = openAIJobSchema.safeParse(candidate);
  if (!parsed.success) return null;
  const sourceUrl = normalizePublicUrl(parsed.data.sourceUrl);
  if (!sourceUrl || !providerSourceUrls.has(sourceUrl)) return null;
  const title = normalizeWhitespace(parsed.data.title).slice(0, 200);
  const companyName = normalizeWhitespace(parsed.data.companyName).slice(
    0,
    200,
  );
  if (!title || !companyName) return null;
  const sourceEvidence = parsed.data.sourceEvidence
    .map((evidence) => {
      const url = normalizePublicUrl(evidence.url);
      if (!url || !providerSourceUrls.has(url)) return null;
      return {
        url,
        title: nullableText(evidence.title, 300),
        excerpt: nullableText(evidence.excerpt, 1_000),
      };
    })
    .filter((evidence): evidence is NonNullable<typeof evidence> =>
      Boolean(evidence),
    );
  if (!sourceEvidence.some((evidence) => evidence.url === sourceUrl)) {
    sourceEvidence.unshift({ url: sourceUrl, title: null, excerpt: null });
  }
  const normalized: OpenAIJob = {
    ...parsed.data,
    title,
    companyName,
    sourceUrl,
    sourceName: nullableText(parsed.data.sourceName, 300),
    descriptionText: nullableText(parsed.data.descriptionText, 8_000),
    requirementsText: nullableText(parsed.data.requirementsText, 8_000),
    responsibilities: normalizedList(parsed.data.responsibilities, 20, 200),
    requiredSkills: normalizedList(parsed.data.requiredSkills, 20, 200),
    preferredSkills: normalizedList(parsed.data.preferredSkills, 20, 200),
    educationRequirements: normalizedList(
      parsed.data.educationRequirements,
      20,
      200,
    ),
    languages: normalizedList(parsed.data.languages, 10, 100),
    country: nullableText(parsed.data.country, 300),
    city: nullableText(parsed.data.city, 300),
    locationText: nullableText(parsed.data.locationText, 300),
    salaryCurrency: nullableText(parsed.data.salaryCurrency, 10),
    postedAt: nullableText(parsed.data.postedAt, 50),
    applicationDeadline: nullableText(parsed.data.applicationDeadline, 50),
    workAuthorizationRequirements: nullableText(
      parsed.data.workAuthorizationRequirements,
      300,
    ),
    sourceEvidence: sourceEvidence.slice(0, 10),
  };
  if (
    normalized.requiredExperienceYearsMin !== null &&
    normalized.requiredExperienceYearsMax !== null &&
    normalized.requiredExperienceYearsMin >
      normalized.requiredExperienceYearsMax
  ) {
    return null;
  }
  if (
    normalized.salaryMin !== null &&
    normalized.salaryMax !== null &&
    normalized.salaryMin > normalized.salaryMax
  ) {
    return null;
  }
  const geo = resolveJobGeography(normalized);
  const locationKey = geo?.placeId
    ? `geo:${geo.placeId}`
    : normalizeIdentityText(
        normalized.city ?? normalized.locationText ?? normalized.country ?? "",
      );
  const canonicalKey = [
    normalizeCompanyIdentity(companyName),
    normalizeTitleIdentity(title),
    locationKey,
  ].join("|");
  const jobFingerprint = hashText(canonicalKey);
  const contentHash = hashText(
    [
      normalizeTitleIdentity(title),
      normalizeCompanyIdentity(companyName),
      normalizeIdentityText(normalized.descriptionText ?? ""),
      normalizeIdentityText(normalized.requirementsText ?? ""),
      normalized.requiredSkills.map(normalizeIdentityText).sort().join("|"),
    ].join("\n"),
  );
  return {
    ...normalized,
    rawProviderJson: JSON.stringify(parsed.data),
    ...(geo ? { geo } : {}),
    normalizedSourceUrl: sourceUrl,
    canonicalKey,
    jobFingerprint,
    contentHash,
  };
}
