import { z } from "zod";
import { resolveJobGeography, type JobGeography } from "./jobGeography";
import { DISCOVERY_SOURCE_GUIDANCE } from "./jobSourceQuality";

export const JOB_DISCOVERY_LIMITS = {
  maxQueries: 5,
  maxJobsPerQuery: 6,
  maxJobsPerRun: 50,
  absoluteMaxOutputTokens: 6_000,
} as const;

const nullableShortText = z.string().max(300).nullable();
const nullableLongText = z.string().max(2_500).nullable();
const shortList = z.array(z.string().max(200)).max(12);

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
            excerpt: z.string().max(500).nullable(),
          })
          .strict(),
      )
      .max(4),
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

type ExperienceRequirementSource = {
  title: string;
  descriptionText: string | null;
  requirementsText: string | null;
  requiredExperienceYearsMin: number | null;
  requiredExperienceYearsMax: number | null;
};

type ParsedExperienceRequirement = {
  min: number;
  max: number | null;
};

function validExperienceYears(value: number) {
  return Number.isInteger(value) && value >= 0 && value <= 80;
}

function parseExperienceRequirements(text: string) {
  const value = normalizeWhitespace(text).toLocaleLowerCase("en-US");
  const found: ParsedExperienceRequirement[] = [];
  const rangeSpans: Array<{ start: number; end: number }> = [];
  const add = (minText: string, maxText?: string) => {
    const min = Number(minText);
    const max = maxText === undefined ? null : Number(maxText);
    if (
      !validExperienceYears(min) ||
      (max !== null && (!validExperienceYears(max) || max < min))
    )
      return;
    found.push({ min, max });
  };

  for (const match of value.matchAll(
    /(\d{1,2})\s*(?:[-–—]|to)\s*(\d{1,2})\s*(?:years?|yrs?)(?:\s*['’])?(?:\s+of)?(?:\s+[\p{L}-]+){0,4}\s*(?:experience)?/giu,
  )) {
    add(match[1], match[2]);
    rangeSpans.push({
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  for (const match of value.matchAll(
    /(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*(?:שנות|שנים)\s*(?:ניסיון|נסיון)/gu,
  )) {
    add(match[1], match[2]);
    rangeSpans.push({
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  for (const match of value.matchAll(
    /(?:at\s+least|minimum(?:\s+of)?|min\.?)\s*(\d{1,2})\s*(?:\+\s*)?(?:years?|yrs?)/giu,
  ))
    add(match[1]);
  for (const match of value.matchAll(
    /(?:לפחות|מינימום)\s*(\d{1,2})\s*(?:\+\s*)?(?:שנות|שנים)\s*(?:ניסיון|נסיון)?/gu,
  ))
    add(match[1]);
  for (const match of value.matchAll(
    /(\d{1,2})\s*\+\s*(?:years?|yrs?)(?:\s*['’])?(?:\s+of)?(?:\s+[\p{L}-]+){0,4}\s*(?:experience)?/giu,
  ))
    add(match[1]);
  for (const match of value.matchAll(
    /(\d{1,2})\s*\+\s*(?:שנות|שנים)\s*(?:ניסיון|נסיון)/gu,
  ))
    add(match[1]);
  for (const match of value.matchAll(
    /(\d{1,2})\s*(?:years?|yrs?)(?:\s*['’])?(?:\s+of)?(?:\s+[\p{L}-]+){0,4}\s+experience/giu,
  )) {
    if (
      rangeSpans.some(
        ({ start, end }) => match.index >= start && match.index < end,
      )
    )
      continue;
    add(match[1], match[1]);
  }
  for (const match of value.matchAll(
    /(\d{1,2})\s*(?:שנות|שנים)\s*(?:ניסיון|נסיון)/gu,
  )) {
    if (
      rangeSpans.some(
        ({ start, end }) => match.index >= start && match.index < end,
      )
    )
      continue;
    add(match[1], match[1]);
  }
  for (const match of value.matchAll(
    /(?:ניסיון|נסיון)(?:\s+[\p{L}-]+){0,3}\s+(?:של\s+)?(\d{1,2})\s*(?:שנים|שנות)/gu,
  ))
    add(match[1], match[1]);

  return found;
}

/** Reconciles structured provider output with explicit bilingual source text.
 * The stricter explicit minimum wins; unknown requirements remain unknown. */
export function resolveExperienceRequirement(
  source: ExperienceRequirementSource,
) {
  const parsed = parseExperienceRequirements(
    [source.requirementsText ?? "", source.descriptionText ?? ""].join("\n"),
  );
  const parsedMin = parsed.length
    ? Math.max(...parsed.map((requirement) => requirement.min))
    : null;
  const parsedMaxes = parsed
    .filter((requirement) => requirement.min === parsedMin)
    .map((requirement) => requirement.max)
    .filter((value): value is number => value !== null);
  const min =
    parsedMin === null
      ? source.requiredExperienceYearsMin
      : source.requiredExperienceYearsMin === null
        ? parsedMin
        : Math.max(parsedMin, source.requiredExperienceYearsMin);
  let max = parsedMaxes.length
    ? Math.max(...parsedMaxes)
    : source.requiredExperienceYearsMax;
  if (min !== null && max !== null && max < min) max = null;
  if (min !== null) return { min, max };

  const title = normalizedKey(source.title);
  if (
    /(?:\bjunior\b|\bjr\.?\b|\bentry[\s-]?level\b|\bgraduate\b|\bintern(?:ship)?\b|ג['׳]?וניור|מתחיל|מתחילה)/u.test(
      title,
    )
  ) {
    return { min: 0, max };
  }
  return { min: null, max };
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

const CONTROLLED_DISCOVERY_ALIASES: Record<string, string[]> = {
  "ecommerce manager": [
    "Ecommerce Manager",
    "E-commerce Website Manager",
    "מנהל איקומרס",
    "מנהל אתר איקומרס",
  ],
  "מנהל אתר ecommerce": [
    "E-commerce Website Manager",
    "Website Manager",
    "מנהל אתר",
    "מנהל/ת אתר איקומרס",
  ],
  "מנהל פרויקטים דיגיטליים": [
    "Digital Project Manager",
    "Digital Projects Manager",
    "מנהל/ת פרויקטים דיגיטליים",
  ],
  "מנהל דיגיטל": [
    "Digital Manager",
    "Digital Operations Manager",
    "מנהל/ת דיגיטל",
  ],
  "מיישם crm ואוטומציות": [
    "CRM Automation Specialist",
    "CRM Implementation Specialist",
    "מיישם/ת CRM",
    "מומחה אוטומציות CRM",
  ],
};

function controlledDiscoveryAliases(title: string) {
  return CONTROLLED_DISCOVERY_ALIASES[normalizeTitleIdentity(title)] ?? [];
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
  // Discovery populates one shared national catalog. User-specific distance
  // belongs to the downstream location gate, not paid provider search identity.
  const locationScope = ["Israel", "ישראל"];
  const queryPlans = titles.slice(0, Math.min(maxQueries, 5)).map((title) => {
    const aliases = uniqueNormalized(
      [
        title,
        ...controlledDiscoveryAliases(title),
        ...(roleVariants.get(normalizeTitleIdentity(title)) ?? []),
      ],
      5,
    );
    const generatedQuery = normalizeWhitespace(
      `Find recent public job vacancies in Israel for "${title}"${aliases.length > 1 ? `. Strong equivalent titles: ${aliases.slice(1).join(", ")}` : ""}. Return exact job-specific URLs and preserve direct employer or ATS URLs when found. ${DISCOVERY_SOURCE_GUIDANCE}`,
    );
    // Discovery is national and shared, so the same role reuses one provider
    // result across Israeli users regardless of their personal radius.
    const normalizedCriteria = JSON.stringify({
      role: normalizeTitleIdentity(title),
      aliases: aliases.map(normalizeTitleIdentity).sort(),
      locationScope: locationScope.map(normalizedKey).sort(),
      countryCode: profile.location.countryCode.toUpperCase(),
      coverageVersion: "israel_direct_fresh_v2",
    });
    return {
      role: title,
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
  let hostname = url.hostname.toLocaleLowerCase("en-US");
  const isLinkedIn =
    hostname === "linkedin.com" || hostname.endsWith(".linkedin.com");
  if (isLinkedIn && url.pathname === "/signup/cold-join") {
    const redirect = url.searchParams.get("session_redirect");
    if (redirect) {
      try {
        const redirectUrl = new URL(redirect);
        const redirectHost = redirectUrl.hostname.toLocaleLowerCase("en-US");
        if (
          redirectHost === "linkedin.com" ||
          redirectHost.endsWith(".linkedin.com")
        ) {
          url = redirectUrl;
          hostname = redirectHost;
        }
      } catch {
        // Keep the original public URL when the wrapper target is malformed.
      }
    }
  }
  if (hostname === "linkedin.com" || hostname.endsWith(".linkedin.com")) {
    const jobId = url.pathname.match(
      /\/jobs\/view\/(?:.*-)?(\d{6,})(?:\/|$)/u,
    )?.[1];
    if (jobId) return `https://www.linkedin.com/jobs/view/${jobId}`;
  }
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
  const normalizedBase: OpenAIJob = {
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
  const experience = resolveExperienceRequirement(normalizedBase);
  const normalized: OpenAIJob = {
    ...normalizedBase,
    requiredExperienceYearsMin: experience.min,
    requiredExperienceYearsMax: experience.max,
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
