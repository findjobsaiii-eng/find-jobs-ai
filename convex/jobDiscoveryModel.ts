import { z } from "zod";

export const JOB_DISCOVERY_LIMITS = {
  maxQueries: 2,
  maxJobsPerQuery: 5,
  maxJobsPerRun: 10,
  cacheTtlMs: 24 * 60 * 60 * 1_000,
  cooldownMs: 60 * 60 * 1_000,
  maxOutputTokens: 4_000,
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
  skills: string[];
  yearsOfExperience: number;
  preferredPlaceId: string;
  locationRadiusKm: number;
  workArrangements: string[];
  employmentTypes: string[];
  languages: Array<{ languageCode: string; proficiency: string }>;
};

export type NormalizedJob = OpenAIJob & {
  normalizedSourceUrl: string;
  jobFingerprint: string;
  contentHash: string;
};

const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  am: "Amharic",
  ar: "Arabic",
  en: "English",
  es: "Spanish",
  fr: "French",
  he: "Hebrew",
  ro: "Romanian",
  ru: "Russian",
  uk: "Ukrainian",
  yi: "Yiddish",
};

function hashText(value: string) {
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

function normalizedKey(value: string) {
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

export function buildSearchPlan(profile: SearchProfile) {
  const targetJobTitles = uniqueNormalized(profile.targetJobTitles, 5);
  const skills = uniqueNormalized(profile.skills, 8);
  const workArrangements = [...new Set(profile.workArrangements)].sort();
  const employmentTypes = [...new Set(profile.employmentTypes)].sort();
  const languages = [...profile.languages]
    .map(({ languageCode, proficiency }) => ({ languageCode, proficiency }))
    .sort((a, b) => a.languageCode.localeCompare(b.languageCode));
  const criteria = {
    targetJobTitles,
    skills,
    experienceBand:
      profile.yearsOfExperience < 2
        ? "entry"
        : profile.yearsOfExperience < 5
          ? "mid"
          : "senior",
    preferredPlaceId: normalizeWhitespace(profile.preferredPlaceId),
    locationRadiusKm: profile.locationRadiusKm,
    workArrangements,
    employmentTypes,
    languages,
    country: "Israel",
  };
  const normalizedCriteria = JSON.stringify(criteria);
  const fingerprint = hashText(normalizedCriteria);
  const qualifiers = [
    criteria.experienceBand !== "entry" ? criteria.experienceBand : "junior",
    ...workArrangements.slice(0, 1),
    ...employmentTypes.slice(0, 1),
    ...languages
      .slice(0, 2)
      .map(({ languageCode }) => LANGUAGE_NAMES[languageCode] ?? languageCode),
    "Israel",
  ].join(" ");
  const generatedQueries = targetJobTitles
    .slice(0, JOB_DISCOVERY_LIMITS.maxQueries)
    .map((title, index) => {
      const selectedSkills = skills.slice(index * 2, index * 2 + 3).join(" ");
      return normalizeWhitespace(
        `${title} ${selectedSkills} ${qualifiers} jobs careers`,
      );
    });
  return { normalizedCriteria, fingerprint, generatedQueries };
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
    if (/^(utm_|gclid|fbclid|ref$|source$)/iu.test(key)) {
      url.searchParams.delete(key);
    }
  }
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
  const locationKey = normalizedKey(
    normalized.city ?? normalized.locationText ?? normalized.country ?? "",
  );
  const jobFingerprint = hashText(
    [normalizedKey(companyName), normalizedKey(title), locationKey].join("|"),
  );
  const contentHash = hashText(JSON.stringify(normalized));
  return {
    ...normalized,
    normalizedSourceUrl: sourceUrl,
    jobFingerprint,
    contentHash,
  };
}
