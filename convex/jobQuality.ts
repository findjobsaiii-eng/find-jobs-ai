import type { Doc } from "./_generated/dataModel";
import type { NormalizedJob, SearchProfile } from "./jobDiscoveryModel";
import { JOB_RELEVANCE_THRESHOLD } from "./jobSearchPolicy";

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
> & { workAuthorizationRequirements?: string | null };

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

function listCoverage(wanted: string[], actual: string[]) {
  if (!wanted.length) return 1;
  if (!actual.length) return 0;
  const text = actual.join(" ");
  return (
    wanted.filter((item) => bestOverlap([item], text) >= 0.5).length /
    wanted.length
  );
}

function roundScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function locationMatches(job: QualityJob, profile: SearchProfile) {
  if (job.workArrangement === "remote") {
    return profile.workArrangements.includes("remote");
  }
  const jobCountry = normalized(job.country ?? job.locationText ?? "");
  const expectedCountry = normalized(profile.location.country);
  if (
    jobCountry &&
    !jobCountry.includes(expectedCountry) &&
    !jobCountry.includes(normalized(profile.location.countryCode)) &&
    !jobCountry.includes("israel") &&
    !jobCountry.includes("ישראל")
  ) {
    return false;
  }
  const jobLocation = normalized(
    [job.city, job.locationText].filter(Boolean).join(" "),
  );
  const expected = [profile.location.city, profile.location.administrativeArea]
    .filter((value): value is string => Boolean(value))
    .map(normalized);
  return Boolean(
    jobLocation && expected.some((value) => jobLocation.includes(value)),
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

  const requiredSkillsCoverage = listCoverage(
    job.requiredSkills,
    profile.skills,
  );
  const preferredSkillsCoverage = listCoverage(
    job.preferredSkills,
    profile.skills,
  );
  const experienceCompatibility =
    job.requiredExperienceYearsMin === null
      ? 0.8
      : profile.yearsOfExperience >= job.requiredExperienceYearsMin
        ? job.requiredExperienceYearsMax === null ||
          profile.yearsOfExperience <= job.requiredExperienceYearsMax + 3
          ? 1
          : 0.75
        : 0;
  const profileText = [...profile.targetJobTitles, ...profile.skills].join(" ");
  const jobText = [
    job.title,
    job.descriptionText,
    job.requirementsText,
    ...job.requiredSkills,
    ...job.preferredSkills,
  ]
    .filter(Boolean)
    .join(" ");
  const semanticSimilarity = overlapScore(profileText, jobText);

  const components = {
    role: roundScore(roleMatch * 100),
    requiredSkills: roundScore(requiredSkillsCoverage * 100),
    preferredSkills: roundScore(preferredSkillsCoverage * 100),
    experience: roundScore(experienceCompatibility * 100),
    location: compatibleLocation ? 100 : 0,
    workArrangement:
      job.workArrangement === "unknown"
        ? 70
        : profile.workArrangements.includes(job.workArrangement)
          ? 100
          : 0,
    employmentType:
      job.employmentType === "unknown"
        ? 70
        : profile.employmentTypes.includes(job.employmentType)
          ? 100
          : 0,
    language: compatibleLanguage ? 100 : 0,
    education: job.educationRequirements.length ? 50 : 100,
    semantic: roundScore(semanticSimilarity * 100),
  };
  const relevanceScore = roundScore(
    components.role * 0.25 +
      components.requiredSkills * 0.2 +
      components.preferredSkills * 0.1 +
      components.experience * 0.1 +
      components.location * 0.15 +
      components.workArrangement * 0.05 +
      components.employmentType * 0.05 +
      components.language * 0.05 +
      components.education * 0.02 +
      components.semantic * 0.03,
  );
  if (!exclusions.length && relevanceScore < JOB_RELEVANCE_THRESHOLD) {
    exclusions.push("below_relevance_threshold");
  }
  const matchReasons = [
    components.role >= 70 ? "role" : null,
    components.requiredSkills >= 60 ? "skills" : null,
    components.location === 100 ? "location" : null,
    components.experience >= 80 ? "experience" : null,
    components.workArrangement === 100 ? "work_arrangement" : null,
  ].filter((value): value is string => Boolean(value));
  return {
    outcome: exclusions.length ? "excluded" : "eligible",
    exclusionReasons: exclusions,
    relevanceScore,
    scoreComponents: components,
    matchReasons: matchReasons.slice(0, 3),
  };
}

export function isDisplayEligibleJob(job: Doc<"jobs">) {
  return (
    job.lifecycleStatus === "verified_active" &&
    !job.canonicalJobId &&
    Boolean(job.bestSourceId)
  );
}
