import type { Doc } from "./_generated/dataModel";
import type { NormalizedJob, SearchProfile } from "./jobDiscoveryModel";
import { distanceKm } from "./jobGeography";
import { isActiveFeedLifecycle } from "./jobActivityPolicy";

export type QualityEvaluation = {
  outcome: "eligible" | "excluded";
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
  };
  matchReasons: string[];
};

type QualityJob = Omit<
  Pick<
    NormalizedJob,
    | "title"
    | "descriptionText"
    | "requirementsText"
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

function normalized(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

function tokens(value: string) {
  return new Set(
    normalized(value)
      .split(/[^\p{L}\p{N}+#.]+/u)
      .filter((token) => token.length > 1),
  );
}

function overlapScore(left: string, right: string) {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const precision = intersection / a.size;
  const recall = intersection / b.size;
  return precision + recall === 0
    ? 0
    : (2 * precision * recall) / (precision + recall);
}

function bestOverlap(needles: string[], value: string) {
  return Math.max(0, ...needles.map((needle) => overlapScore(needle, value)));
}

function skillCoverage(needles: string[], haystack: string[]) {
  if (!needles.length) return 0.5;
  return (
    needles.filter((skill) => bestOverlap(haystack, skill) >= 0.5).length /
    needles.length
  );
}

function locationMatches(job: QualityJob, profile: SearchProfile) {
  if (job.workArrangement === "remote") {
    const country = normalized(job.geo?.countryCode ?? job.country ?? "");
    return (
      profile.workArrangements.includes("remote") &&
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

export function evaluateJobQuality(
  job: QualityJob,
  profile: SearchProfile,
): QualityEvaluation {
  const exclusions: string[] = [];
  const targetRoleMatch = bestOverlap(profile.targetJobTitles, job.title);
  const pastRoleMatch = bestOverlap(
    profile.normalizedPastRoles ?? [],
    job.title,
  );
  const roleMatch = Math.max(targetRoleMatch, pastRoleMatch * 0.85);
  if (roleMatch < 0.4) exclusions.push("target_role_conflict");

  const compatibleLocation = locationMatches(job, profile);
  if (!compatibleLocation) exclusions.push("location_conflict");

  if (
    job.workArrangement !== "unknown" &&
    !profile.workArrangements.includes(job.workArrangement)
  ) {
    exclusions.push("work_arrangement_conflict");
  }
  if (
    job.employmentType !== "unknown" &&
    !profile.employmentTypes.includes(job.employmentType)
  ) {
    exclusions.push("employment_type_conflict");
  }
  if (
    job.requiredExperienceYearsMin !== null &&
    profile.yearsOfExperience < job.requiredExperienceYearsMin
  ) {
    exclusions.push("experience_conflict");
  }
  const compatibleLanguage = languageMatches(job.languages, profile);
  if (!compatibleLanguage) exclusions.push("language_conflict");
  if (
    job.salaryMax !== null &&
    normalized(job.salaryCurrency ?? "") === "ils" &&
    job.salaryPeriod === "month" &&
    job.salaryMax < profile.minimumMonthlySalaryIls
  ) {
    exclusions.push("salary_conflict");
  }
  const workAuthorization = normalized(job.workAuthorizationRequirements ?? "");
  if (
    workAuthorization &&
    /(us citizen|united states authorization|authorized to work in the us|eu work permit|uk work authorization)/u.test(
      workAuthorization,
    )
  ) {
    exclusions.push("work_authorization_conflict");
  }

  const requiredSkills = skillCoverage(job.requiredSkills, profile.skills);
  const preferredSkills = skillCoverage(job.preferredSkills, profile.skills);
  const experience =
    job.requiredExperienceYearsMin === null
      ? 0.7
      : Math.min(
          1,
          profile.yearsOfExperience /
            Math.max(1, job.requiredExperienceYearsMin),
        );
  const workArrangement =
    job.workArrangement === "unknown" ||
    profile.workArrangements.includes(job.workArrangement)
      ? 1
      : 0;
  const employmentType =
    job.employmentType === "unknown" ||
    profile.employmentTypes.includes(job.employmentType)
      ? 1
      : 0;
  const scoreComponents = {
    role: Math.round(roleMatch * 40),
    requiredSkills: Math.round(requiredSkills * 20),
    preferredSkills: Math.round(preferredSkills * 10),
    experience: Math.round(experience * 10),
    location: compatibleLocation ? 10 : 0,
    workArrangement: workArrangement * 5,
    employmentType: employmentType * 5,
    language: compatibleLanguage ? 0 : 0,
    education: 0,
    semantic: 0,
  };
  return {
    outcome: exclusions.length ? "excluded" : "eligible",
    exclusionReasons: exclusions,
    relevanceScore: Object.values(scoreComponents).reduce(
      (sum, value) => sum + value,
      0,
    ),
    scoreComponents,
    matchReasons: [
      ...(targetRoleMatch >= 0.4 ? ["target_role"] : []),
      ...(pastRoleMatch >= 0.5 ? ["past_role"] : []),
      ...(requiredSkills >= 0.5 ? ["core_skills"] : []),
      ...(compatibleLocation ? ["location"] : []),
    ],
  };
}

export function isDisplayEligibleJob(job: Doc<"jobs">) {
  return (
    isActiveFeedLifecycle(job.lifecycleStatus) &&
    !job.canonicalJobId &&
    Boolean(job.bestSourceId)
  );
}
