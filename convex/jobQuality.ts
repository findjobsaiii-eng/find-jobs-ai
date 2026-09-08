import type { Doc } from "./_generated/dataModel";
import type { NormalizedJob, SearchProfile } from "./jobDiscoveryModel";
import { distanceKm } from "./jobGeography";
import { isActiveFeedLifecycle } from "./jobActivityPolicy";

export const MINIMUM_RELEVANCE_SCORE = 58;

export type QualityEvaluation = {
  outcome: "eligible" | "excluded";
  hardEligibilityPassed: boolean;
  passesRelevanceThreshold: boolean;
  exclusionReasons: string[];
  relevanceScore: number;
  scoreComponents: {
    role: number;
    requiredSkills: number;
    preferredSkills: number;
    experience: number;
    location: number;
    workArrangement: number;
    employmentType: number;
    language: number;
    education: number;
    semantic: number;
    domain: number;
    seniority: number;
    preferences: number;
  };
  matchReasons: string[];
  matchDetails: {
    targetRole?: string;
    pastRole?: string;
    skills: string[];
    domain?: string;
    location: boolean;
  };
};

type QualityJob = Omit<
  Pick<
    NormalizedJob,
    | "title"
    | "descriptionText"
    | "requirementsText"
    | "responsibilities"
    | "requiredSkills"
    | "preferredSkills"
    | "requiredExperienceYearsMin"
    | "requiredExperienceYearsMax"
    | "educationRequirements"
    | "languages"
    | "country"
    | "city"
    | "locationText"
    | "workArrangement"
    | "employmentType"
    | "salaryMax"
    | "salaryCurrency"
    | "salaryPeriod"
    | "workAuthorizationRequirements"
  >,
  "workAuthorizationRequirements"
> & {
  workAuthorizationRequirements?: string | null;
  geo?: { latitude: number; longitude: number; countryCode: string };
};

const LANGUAGE_NAMES: Readonly<Record<string, string[]>> = {
  he: ["he", "hebrew", "עברית"],
  en: ["en", "english", "אנגלית"],
  ar: ["ar", "arabic", "ערבית"],
  ru: ["ru", "russian", "רוסית"],
  fr: ["fr", "french", "צרפתית"],
  am: ["am", "amharic", "אמהרית"],
  es: ["es", "spanish", "ספרדית"],
  uk: ["uk", "ukrainian", "אוקראינית"],
  ro: ["ro", "romanian", "רומנית"],
  yi: ["yi", "yiddish", "יידיש"],
};

const GENERIC_ROLE_TOKENS = new Set([
  "manager",
  "management",
  "digital",
  "technology",
  "technologies",
  "tech",
  "website",
  "web",
  "operations",
  "operation",
  "lead",
  "leader",
  "specialist",
  "מנהל",
  "מנהלת",
  "ניהול",
  "דיגיטל",
  "טכנולוגי",
  "אתר",
  "תפעול",
]);

const SOFT_SKILL_PATTERN =
  /(?:communication|problem solving|teamwork|stakeholder|collaboration|organized|organisation|organization|motivated|detail oriented|תקשורת|עבודת צוות|יחסי אנוש|סדר ודיוק)/u;

function normalized(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/\be[\s-]+commerce\b/gu, "ecommerce")
    .replace(/\bfull[\s-]+stack\b/gu, "fullstack")
    .replace(/\bfront[\s-]+end\b/gu, "frontend")
    .replace(/\bback[\s-]+end\b/gu, "backend")
    .replace(/\bshop(?:y|i)fy\b/gu, "shopify")
    .replace(/\s+/gu, " ");
}

function tokens(value: string) {
  return [
    ...new Set(
      normalized(value)
        .split(/[^\p{L}\p{N}+#.]+/u)
        .filter((token) => token.length > 1),
    ),
  ];
}

function tokenWeight(token: string) {
  if (GENERIC_ROLE_TOKENS.has(token)) return 0.15;
  if (
    /^(?:senior|junior|mid|principal|director|head|vp|sr|jr|בכיר|בכירה)$/u.test(
      token,
    )
  )
    return 0;
  if (
    /^(?:ecommerce|shopify|woocommerce|magento|frontend|backend|fullstack|ppc|seo|qa|איקומרס)$/u.test(
      token,
    )
  )
    return 2.4;
  if (
    /^(?:developer|engineer|product|project|marketing|content|sales|success|מפתח|מפתחת|מהנדס|מוצר|פרויקטים|שיווק|מכירות)$/u.test(
      token,
    )
  )
    return 1.25;
  return 0.65;
}

function levenshtein(left: string, right: string) {
  const previous = Array.from(
    { length: right.length + 1 },
    (_, index) => index,
  );
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      previous[rightIndex] =
        left[leftIndex - 1] === right[rightIndex - 1]
          ? diagonal
          : Math.min(diagonal, above, previous[rightIndex - 1]) + 1;
      diagonal = above;
    }
  }
  return previous[right.length];
}

function tokenEquivalent(left: string, right: string) {
  if (left === right) return true;
  return (
    left.length >= 6 &&
    right.length >= 6 &&
    Math.abs(left.length - right.length) <= 1 &&
    levenshtein(left, right) <= 1
  );
}

function weightedTitleSimilarity(left: string, right: string) {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.length || !b.length) return 0;
  if (normalized(left) === normalized(right)) return 1;
  const totalA = a.reduce((sum, token) => sum + tokenWeight(token), 0);
  const totalB = b.reduce((sum, token) => sum + tokenWeight(token), 0);
  if (!totalA || !totalB) return 0;
  let intersection = 0;
  const used = new Set<number>();
  for (const token of a) {
    const matchIndex = b.findIndex(
      (candidate, index) =>
        !used.has(index) && tokenEquivalent(token, candidate),
    );
    if (matchIndex < 0) continue;
    used.add(matchIndex);
    intersection += Math.min(tokenWeight(token), tokenWeight(b[matchIndex]));
  }
  return (2 * intersection) / (totalA + totalB);
}

type RoleConcept =
  | "development"
  | "frontend"
  | "backend"
  | "fullstack"
  | "ecommerce"
  | "site_management"
  | "product"
  | "project"
  | "marketing"
  | "customer_success"
  | "content"
  | "sales"
  | "qa";

function roleConcepts(value: string) {
  const text = normalized(value);
  const concepts = new Set<RoleConcept>();
  if (
    /(?:developer|engineer|programmer|software development|web development|מפתח|מפתחת|פיתוח תוכנה|מהנדס)/u.test(
      text,
    )
  )
    concepts.add("development");
  if (/(?:frontend|client side|פרונט)/u.test(text)) concepts.add("frontend");
  if (/(?:backend|server side|בקאנד)/u.test(text)) concepts.add("backend");
  if (/(?:fullstack|פול סטאק)/u.test(text)) concepts.add("fullstack");
  if (
    /(?:ecommerce|shopify|woocommerce|magento|online store|catalog management|checkout flows|איקומרס|מסחר אלקטרוני)/u.test(
      text,
    )
  )
    concepts.add("ecommerce");
  if (
    /(?:website manager|site manager|website management|web operations|ניהול אתר|מנהל אתר|מתפעל.*אתר)/u.test(
      text,
    )
  )
    concepts.add("site_management");
  if (
    /(?:product manager|product management|מנהל.?ת? מוצר|ניהול מוצר)/u.test(
      text,
    )
  )
    concepts.add("product");
  if (
    /(?:project manager|project management|מנהל.?ת? פרויקטים|ניהול פרויקטים)/u.test(
      text,
    )
  )
    concepts.add("project");
  if (/(?:marketing|ppc|campaign|שיווק|קמפיינים)/u.test(text))
    concepts.add("marketing");
  if (/(?:customer success|client success|הצלחת לקוח)/u.test(text))
    concepts.add("customer_success");
  if (
    /(?:content creator|content presenter|copywriter|יצירת תוכן|תוכן שיווקי)/u.test(
      text,
    )
  )
    concepts.add("content");
  if (/(?:sales|account executive|business development|מכירות)/u.test(text))
    concepts.add("sales");
  if (/(?:quality assurance|qa engineer|qa tester|בדיקות תוכנה)/u.test(text))
    concepts.add("qa");
  return concepts;
}

function setSimilarity<T>(left: Set<T>, right: Set<T>) {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  return (2 * intersection) / (left.size + right.size);
}

function bestTitleMatch(needles: string[], value: string) {
  return needles.reduce(
    (best, candidate) => {
      const score = Math.max(
        weightedTitleSimilarity(candidate, value),
        setSimilarity(roleConcepts(candidate), roleConcepts(value)) * 0.86,
      );
      return score > best.score ? { score, value: candidate } : best;
    },
    { score: 0, value: undefined as string | undefined },
  );
}

function canonicalSkill(value: string) {
  return normalized(value)
    .replace(/\bshopify plus\b/gu, "shopify")
    .replace(/\bhtml5\b/gu, "html")
    .replace(/\bcss3\b/gu, "css")
    .replace(/\bjavascript es\d(?:\+)?\b/gu, "javascript")
    .replace(/\bgoogle analytics 4\b/gu, "ga4")
    .replace(/\s+familiarity$/u, "")
    .trim();
}

function skillSimilarity(left: string, right: string) {
  const a = canonicalSkill(left);
  const b = canonicalSkill(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a)))
    return 0.9;
  const leftTokens = tokens(a).filter(
    (token) => !GENERIC_ROLE_TOKENS.has(token),
  );
  const rightTokens = tokens(b).filter(
    (token) => !GENERIC_ROLE_TOKENS.has(token),
  );
  if (leftTokens.length === 1 && rightTokens.length === 1)
    return tokenEquivalent(leftTokens[0], rightTokens[0]) ? 0.9 : 0;
  const shared = leftTokens.filter((token) =>
    rightTokens.some((candidate) => tokenEquivalent(token, candidate)),
  ).length;
  return shared ? (2 * shared) / (leftTokens.length + rightTokens.length) : 0;
}

function skillWeight(value: string) {
  const skill = canonicalSkill(value);
  if (SOFT_SKILL_PATTERN.test(skill)) return 0.2;
  if (
    /(?:shopify|woocommerce|magento|salesforce commerce|node.js|react|typescript|javascript|php|python|sql|mongodb|postgresql|html|css|seo|ga4|google tag manager|erp|sap)/u.test(
      skill,
    )
  )
    return 2.4;
  if (
    /(?:ecommerce|catalog|checkout|website|web development|product data)/u.test(
      skill,
    )
  )
    return 1.7;
  return 0.8;
}

function skillCoverage(needed: string[], profileSkills: string[]) {
  if (!needed.length || !profileSkills.length)
    return { score: 0, matched: [] as string[] };
  let totalWeight = 0;
  let matchedWeight = 0;
  const matched: string[] = [];
  for (const need of needed) {
    const weight = skillWeight(need);
    const similarity = Math.max(
      0,
      ...profileSkills.map((skill) => skillSimilarity(need, skill)),
    );
    totalWeight += weight;
    matchedWeight += weight * similarity;
    if (similarity >= 0.75) matched.push(need);
  }
  return { score: totalWeight ? matchedWeight / totalWeight : 0, matched };
}

function locationMatches(job: QualityJob, profile: SearchProfile) {
  if (job.workArrangement === "remote") {
    if (!profile.workArrangements.includes("remote")) return false;
    const country = normalized(job.geo?.countryCode ?? job.country ?? "");
    return (
      !country ||
      [
        normalized(profile.location.countryCode),
        normalized(profile.location.country),
        "israel",
        "ישראל",
      ].includes(country)
    );
  }
  return Boolean(
    job.geo &&
    job.geo.countryCode.toUpperCase() ===
      profile.location.countryCode.toUpperCase() &&
    distanceKm(job.geo, profile.location) <= profile.location.radiusKm,
  );
}

function languageMatches(jobLanguages: string[], profile: SearchProfile) {
  if (!jobLanguages.length) return true;
  const candidateTerms = new Set(
    profile.languages.flatMap(
      ({ languageCode }) => LANGUAGE_NAMES[languageCode] ?? [languageCode],
    ),
  );
  return jobLanguages.every((language) => {
    const value = normalized(language);
    return [...candidateTerms].some((term) => value.includes(normalized(term)));
  });
}

const SENIORITY_LEVELS: Readonly<Record<string, number>> = {
  entry: 0,
  junior: 0,
  mid: 1,
  senior: 2,
  lead: 3,
  principal: 3,
  head: 4,
  director: 4,
  executive: 5,
};

function inferredJobSeniority(title: string) {
  const value = normalized(title);
  if (/(?:chief|vp|vice president|executive|סמנכ|מנכ)/u.test(value)) return 5;
  if (/(?:director|head of|ראש תחום|מנהל אגף)/u.test(value)) return 4;
  if (/(?:principal|tech lead|team lead|leader|lead |ראש צוות)/u.test(value))
    return 3;
  if (/(?:senior|sr\.?|בכיר|בכירה)/u.test(value)) return 2;
  if (/(?:junior|jr\.?|entry|מתחיל|מתחילה)/u.test(value)) return 0;
  return null;
}

function profileSeniorityLevel(value?: string) {
  return value ? (SENIORITY_LEVELS[normalized(value)] ?? null) : null;
}

function domainEvaluation(job: QualityJob, profile: SearchProfile) {
  const jobConcepts = roleConcepts(
    [
      job.title,
      job.descriptionText ?? "",
      job.requirementsText ?? "",
      ...job.responsibilities,
      ...job.requiredSkills,
      ...job.preferredSkills,
    ].join(" "),
  );
  const profileValues = [
    ...(profile.professionalDomains ?? []),
    ...(profile.currentRole ? [profile.currentRole] : []),
    ...(profile.normalizedPastRoles ?? []),
    ...profile.targetJobTitles,
  ];
  const profileConcepts = roleConcepts(profileValues.join(" "));
  const score = profileConcepts.size
    ? setSimilarity(profileConcepts, jobConcepts)
    : 0.5;
  const bestDomain = (profile.professionalDomains ?? []).reduce(
    (best, domain) => {
      const domainScore = setSimilarity(roleConcepts(domain), jobConcepts);
      return domainScore > best.score
        ? { score: domainScore, value: domain }
        : best;
    },
    { score: 0, value: undefined as string | undefined },
  );
  return {
    score,
    value: bestDomain.score >= 0.4 ? bestDomain.value : undefined,
  };
}

export function evaluateJobQuality(
  job: QualityJob,
  profile: SearchProfile,
): QualityEvaluation {
  const hardExclusions: string[] = [];
  const targetRole = bestTitleMatch(profile.targetJobTitles, job.title);
  const currentRole = profile.currentRole
    ? bestTitleMatch([profile.currentRole], job.title)
    : { score: 0, value: undefined };
  const pastRole = (profile.normalizedPastRoles ?? []).reduce(
    (best, role, index) => {
      const match = bestTitleMatch([role], job.title);
      const score = match.score * Math.max(0.62, 0.82 - index * 0.04);
      return score > best.score ? { score, value: role } : best;
    },
    { score: 0, value: undefined as string | undefined },
  );
  const roleMatch = Math.max(
    targetRole.score,
    currentRole.score * 0.92,
    pastRole.score,
  );

  const required = skillCoverage(job.requiredSkills, profile.skills);
  const preferred = skillCoverage(job.preferredSkills, profile.skills);
  const combinedSkillScore = Math.max(required.score, preferred.score * 0.7);
  const domain = domainEvaluation(job, profile);
  const compatibleLocation = locationMatches(job, profile);
  if (!compatibleLocation) hardExclusions.push("location_conflict");

  const workArrangementCompatible =
    job.workArrangement === "unknown" ||
    profile.workArrangements.includes(job.workArrangement);
  if (!workArrangementCompatible)
    hardExclusions.push("work_arrangement_conflict");
  const employmentTypeCompatible =
    job.employmentType === "unknown" ||
    profile.employmentTypes.includes(job.employmentType);
  if (!employmentTypeCompatible)
    hardExclusions.push("employment_type_conflict");

  let experience = 0.7;
  if (job.requiredExperienceYearsMin !== null) {
    const gap = job.requiredExperienceYearsMin - profile.yearsOfExperience;
    experience = gap <= 0 ? 1 : gap <= 1 ? 0.35 : 0;
    if (gap > 1) hardExclusions.push("experience_conflict");
  }

  const jobSeniority = inferredJobSeniority(job.title);
  const candidateSeniority = profileSeniorityLevel(profile.seniority);
  let seniority = 0.75;
  if (jobSeniority !== null && candidateSeniority !== null) {
    const gap = Math.abs(jobSeniority - candidateSeniority);
    seniority = gap === 0 ? 1 : gap === 1 ? 0.5 : gap === 2 ? 0.15 : 0;
    if (jobSeniority - candidateSeniority >= 2)
      hardExclusions.push("seniority_conflict");
  }

  const compatibleLanguage = languageMatches(job.languages, profile);
  if (!compatibleLanguage) hardExclusions.push("language_conflict");
  if (
    job.salaryMax !== null &&
    normalized(job.salaryCurrency ?? "") === "ils" &&
    job.salaryPeriod === "month" &&
    job.salaryMax < profile.minimumMonthlySalaryIls
  )
    hardExclusions.push("salary_conflict");
  const workAuthorization = normalized(job.workAuthorizationRequirements ?? "");
  if (
    workAuthorization &&
    /(us citizen|united states authorization|authorized to work in the us|eu work permit|uk work authorization)/u.test(
      workAuthorization,
    )
  )
    hardExclusions.push("work_authorization_conflict");
  if (roleMatch < 0.28 && domain.score < 0.3 && combinedSkillScore < 0.25)
    hardExclusions.push("professional_mismatch");

  const preferences =
    (workArrangementCompatible ? 0.5 : 0) +
    (employmentTypeCompatible ? 0.5 : 0);
  const scoreComponents = {
    role: Math.round(roleMatch * 35),
    requiredSkills: Math.round(required.score * 18),
    preferredSkills: Math.round(preferred.score * 7),
    experience: Math.round(experience * 10),
    location: compatibleLocation ? 5 : 0,
    workArrangement: 0,
    employmentType: 0,
    language: 0,
    education: 0,
    semantic: 0,
    domain: Math.round(domain.score * 15),
    seniority: Math.round(seniority * 7),
    preferences: Math.round(preferences * 3),
  };
  const relevanceScore = Object.values(scoreComponents).reduce(
    (sum, value) => sum + value,
    0,
  );
  const passesRelevanceThreshold = relevanceScore >= MINIMUM_RELEVANCE_SCORE;
  const exclusionReasons = [
    ...hardExclusions,
    ...(!passesRelevanceThreshold ? ["below_relevance_threshold"] : []),
  ];
  const matchedSkills = [
    ...new Set([...required.matched, ...preferred.matched]),
  ];
  const matchDetails = {
    ...(targetRole.score >= 0.5 && targetRole.value
      ? { targetRole: targetRole.value }
      : {}),
    ...(pastRole.score >= 0.48 && pastRole.value
      ? { pastRole: pastRole.value }
      : {}),
    skills: matchedSkills.slice(0, 3),
    ...(domain.value ? { domain: domain.value } : {}),
    location: compatibleLocation,
  };
  return {
    outcome:
      !hardExclusions.length && passesRelevanceThreshold
        ? "eligible"
        : "excluded",
    hardEligibilityPassed: hardExclusions.length === 0,
    passesRelevanceThreshold,
    exclusionReasons,
    relevanceScore,
    scoreComponents,
    matchReasons: [
      ...(matchDetails.targetRole ? ["target_role"] : []),
      ...(matchDetails.pastRole ? ["past_role"] : []),
      ...(matchDetails.skills.length ? ["core_skills"] : []),
      ...(matchDetails.domain ? ["domain"] : []),
      ...(compatibleLocation ? ["location"] : []),
    ],
    matchDetails,
  };
}

export function isDisplayEligibleJob(job: Doc<"jobs">) {
  return (
    isActiveFeedLifecycle(job.lifecycleStatus) &&
    !job.canonicalJobId &&
    Boolean(job.bestSourceId)
  );
}
