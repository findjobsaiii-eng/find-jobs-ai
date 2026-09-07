import type { Doc } from "./_generated/dataModel";
import type { NormalizedJob, SearchProfile } from "./jobDiscoveryModel";
import { distanceKm } from "./jobGeography";

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
  const roleMatch = bestOverlap(profile.targetJobTitles, job.title);
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

  return {
    outcome: exclusions.length ? "excluded" : "eligible",
    exclusionReasons: exclusions,
    relevanceScore: 0,
    scoreComponents: {
      role: 0,
      requiredSkills: 0,
      preferredSkills: 0,
      experience: 0,
      location: 0,
      workArrangement: 0,
      employmentType: 0,
      language: 0,
      education: 0,
      semantic: 0,
    },
    matchReasons: [],
  };
}

export function isDisplayEligibleJob(job: Doc<"jobs">) {
  return (
    job.lifecycleStatus === "verified_active" &&
    !job.canonicalJobId &&
    Boolean(job.bestSourceId)
  );
}
