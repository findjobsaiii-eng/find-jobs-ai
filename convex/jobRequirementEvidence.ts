import {
  hashText,
  isEmployerExperienceStatement,
  resolveExperienceRequirement,
} from "./jobDiscoveryModel";
import type { NormalizedJob } from "./jobDiscoveryModel";
import type { JobSourceTier } from "./jobSourceQuality";

/** Collapse repeated punctuation/spacing variants without merging distinct conditions. */
export function dedupeAdditionalRequirements(values: string[]) {
  const conditions = new Map<string, string>();
  for (const value of values) {
    const text = value.normalize("NFKC").toLowerCase();
    const key = text.replace(/[^\p{L}\p{N}]+/gu, "");
    conditions.set(key, value);
  }
  return [...conditions.values()];
}

/** Preserve explicit posting conditions, including ones our profile cannot prove. */
export function sourceRequirementPatch(
  job: {
    title: string;
    descriptionText: string | null;
    requirementsText: string | null;
    requiredExperienceYearsMin: number | null;
    requiredExperienceYearsMax: number | null;
    requiredSkills: string[];
    preferredSkills: string[];
    languages: string[];
    educationRequirements: string[];
  },
  text: string,
  tier: JobSourceTier,
) {
  const heading =
    /(?:what we (?:require|value|look for)|(?:minimum |basic |essential |preferred )?qualifications|(?:job |candidate )?requirements|what you(?:'|’)ll (?:need|bring)|who you are|דרישות(?: המשרה)?|מה אנחנו מחפשים)/iu;
  const start = text.search(heading);
  const source = (start >= 0 ? text.slice(start) : text).split(
    /(?:apply for this job|submit (?:your )?application|equal opportunity|privacy (?:policy|notice)|הגשת מועמדות)/iu,
  )[0];
  const clauses = source
    .split(/\n|;|•|(?<=[.!?])\s+/u)
    .map((value) => value.trim())
    .filter((value) => value.length > 12);
  const condition =
    /(?:\byears?\b.{0,60}\bexperience\b|\bexperience\b|\bproficien|\bfluenc|\bfluent|\bdegree\b|\bacademic\b|\bgpa\b|transcript|clearance|certif|licen[cs]e|must |required|mandatory|knowledge|ability|ניסיון|חובה|תואר|תעודה|רישיון|שליטה|ממוצע ציונים)/iu;
  const requirements = clauses.filter(
    (value) => condition.test(value) && !isEmployerExperienceStatement(value),
  );
  const bounded = requirements
    .slice(0, 60)
    .map((value) => value.slice(0, 1200));
  const requirementsText = bounded.join("\n").slice(0, 24000);
  const complete =
    (tier === "employer" || tier === "ats") &&
    start >= 0 &&
    requirements.length > 0 &&
    requirements.length <= 60 &&
    requirements.every((value) => value.length <= 1200) &&
    requirementsText.length < 24000;
  // Source text is authoritative when it contains an explicit numeric range.
  const experience = resolveExperienceRequirement({
    ...job,
    descriptionText: null,
    requirementsText,
    requiredExperienceYearsMin: null,
    requiredExperienceYearsMax: null,
  });
  const languages = bounded
    .filter((value) =>
      /(?:hebrew|english|arabic|russian|עברית|אנגלית|ערבית|רוסית)/iu.test(
        value,
      ),
    )
    .map((value) => value.slice(0, 300));
  const education = bounded
    .filter((value) =>
      /(?:\bdegree\b|bachelor|master|academic background|תואר)/iu.test(value),
    )
    .map((value) => value.slice(0, 1200));
  const special =
    /(?:gpa|transcript|clearance|ממוצע ציונים|גיליון ציונים|סיווג ביטחוני)/iu;
  const additional = bounded.filter((value) => {
    if (special.test(value)) return true;
    // Unmapped conditions must remain visible and unconfirmed, not silently disappear.
    const numericExperience =
      /\d{1,2}\s*(?:[+–—-]\s*\d{0,2}\+?\s*)?(?:years?|yrs?|שנות|שנים)/iu.test(
        value,
      );
    const credential =
      /(?:driv(?:ing|er).{0,10}licen[cs]e|\bcpa\b|\bpmp\b|\bcissp\b|\bccna\b|\bccnp\b|nursing licen[cs]e|רישיון נהיגה)/iu.test(
        value,
      );
    const knownSkill = [...job.requiredSkills, ...job.preferredSkills].some(
      (skill) => value.toLowerCase().includes(skill.toLowerCase()),
    );
    return (
      !numericExperience &&
      !credential &&
      !languages.includes(value.slice(0, 300)) &&
      !education.includes(value.slice(0, 1200)) &&
      !knownSkill
    );
  });
  return {
    requirementsStatus: complete
      ? ("complete" as const)
      : ("incomplete" as const),
    // Keep original text for unstructured conditions and on-demand deep review.
    requirementsText: requirementsText || job.requirementsText,
    requiredExperienceYearsMin:
      experience.min ??
      (start >= 0 || tier === "ats" || tier === "employer"
        ? null
        : job.requiredExperienceYearsMin),
    requiredExperienceYearsMax:
      experience.max ??
      (start >= 0 || tier === "ats" || tier === "employer"
        ? null
        : job.requiredExperienceYearsMax),
    languages: languages.length ? languages : job.languages,
    educationRequirements: education.length
      ? education
      : job.educationRequirements,
    additionalRequirements: additional,
    contentHash: hashText(
      JSON.stringify({
        title: job.title,
        requirementsText,
        skills: job.requiredSkills,
        languages,
        education,
        additional,
      }),
    ),
  };
}

export function hydrateJobRequirements(
  job: NormalizedJob,
  verification: {
    rawSourceText?: string;
    sourceTier: JobSourceTier;
    identityMatched: boolean;
  },
) {
  if (!verification.identityMatched || !verification.rawSourceText)
    return { ...job, requirementsStatus: "incomplete" as const };
  return {
    ...job,
    ...sourceRequirementPatch(
      job,
      verification.rawSourceText,
      verification.sourceTier,
    ),
    requirementsStatus: "incomplete" as const,
  };
}
