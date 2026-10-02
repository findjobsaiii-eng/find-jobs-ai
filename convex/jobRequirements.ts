import {
  normalizeEducationTerm,
  identityTermKey,
} from "./referenceIdentityModel";
import type { SearchProfile } from "./jobDiscoveryModel";
import { skillsEquivalent } from "./skillIdentity";
import { matchingEducationFieldKeys } from "./educationIdentity";

export type RequirementAssessment = {
  requirement: string;
  status: "met" | "gap" | "unknown";
  importance: "must_have" | "important" | "minor";
  evidence: string;
  nextStep: string | null;
};

type RequirementJob = {
  requiredSkills: string[];
  preferredSkills: string[];
  educationRequirements: string[];
  languages: string[];
  requirementsText: string | null;
};

const academicLevels = { bachelor: 1, master: 2, doctorate: 3 } as const;
const languageNames: Record<string, string[]> = {
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
const languageLevels: Record<string, number> = {
  basic: 1,
  conversational: 2,
  professional: 3,
  fluent: 4,
  native: 5,
};
function normalize(value: string) {
  return value.normalize("NFKC").toLowerCase().trim();
}
function preferred(value: string) {
  return /(?:preferred|advantage|nice.to.have|יתרון|עדיפות)/u.test(value);
}
function educationAssessment(
  requirement: string,
  profile: SearchProfile,
  relevantExperienceYears: number | null | undefined,
): RequirementAssessment {
  const text = normalize(requirement);
  const importance = preferred(text)
    ? ("important" as const)
    : ("must_have" as const);
  const result: RequirementAssessment = {
    requirement,
    importance,
    status: "unknown",
    evidence: "jobMatching.evidence.educationUnknown",
    nextStep: "jobMatching.nextStep.education",
  };
  const acceptsStudents =
    /(?:students? (?:welcome|accepted|eligible)|currently (?:studying|pursuing)|degree in progress|סטודנטים|סטודנט|במהלך (?:תואר|לימודים))/u.test(
      text,
    );
  const requestedLevels = [
    /(?:bachelor|b\.?sc|b\.?a\b|תואר ראשון|academic degree|university degree|תואר אקדמי)/u.test(
      text,
    )
      ? 1
      : null,
    /(?:master|m\.?sc|תואר שני)/u.test(text) ? 2 : null,
    /(?:doctorate|ph\.?d|דוקטור)/u.test(text) ? 3 : null,
  ].filter((level): level is number => level !== null);
  const requiredLevel = requestedLevels.length
    ? /(?:\bor\b|או)/u.test(text)
      ? Math.min(...requestedLevels)
      : Math.max(...requestedLevels)
    : /(?:\bdegree\b|תואר)/u.test(text) ||
        (acceptsStudents &&
          matchingEducationFieldKeys(profile.identityCatalog, requirement)
            .length > 0)
      ? 1
      : null;
  if (requiredLevel === null) return result;
  const qualifications = profile.qualifications;
  const completed =
    qualifications?.education.filter(
      (item) =>
        (item.status === "completed" ||
          (acceptsStudents && item.status === "in_progress")) &&
        item.level in academicLevels,
    ) ?? [];
  const levelMatches = completed.filter(
    (item) =>
      academicLevels[item.level as keyof typeof academicLevels] >=
      requiredLevel,
  );
  const fields = matchingEducationFieldKeys(
    profile.identityCatalog,
    requirement,
  );
  const unspecifiedField =
    fields.length === 0 &&
    /(?:degree\s+in\s+|תואר\s+(?:ראשון\s+|שני\s+)?ב)/u.test(text);
  const candidateFields = (
    entry: NonNullable<SearchProfile["qualifications"]>["education"][number],
  ) =>
    matchingEducationFieldKeys(
      profile.identityCatalog,
      entry.field,
      entry.credential,
    );
  const matchingDegree = levelMatches.find((entry) => {
    const knownFields = candidateFields(entry);
    return fields.length === 0
      ? !unspecifiedField
      : knownFields.length === 1 && fields.includes(knownFields[0]);
  });
  const pendingEvidence = qualifications?.education.some(
    (item) => item.status === "unknown" || item.level === "other",
  );
  const degreeMissing =
    !qualifications?.education.length ||
    (!pendingEvidence &&
      !unspecifiedField &&
      (!levelMatches.length ||
        (fields.length > 0 &&
          levelMatches.every((entry) => {
            const knownFields = candidateFields(entry);
            return knownFields.length === 1 && !fields.includes(knownFields[0]);
          }))));
  if (matchingDegree)
    return {
      ...result,
      status: "met",
      evidence:
        matchingDegree.status === "in_progress"
          ? "jobMatching.evidence.educationInProgressMet"
          : "jobMatching.evidence.educationMet",
      nextStep: null,
    };
  const hasAlternative =
    /(?:or.{0,45}(?:equivalent|relevant|practical|professional).{0,30}experience|או.{0,35}ניסיון.{0,35}(?:מקביל|רלוונטי|מעשי|מקצועי))/u.test(
      text,
    );
  if (hasAlternative) {
    const explicitMinimum = text.match(
      /(?:\bor\b|או).{0,35}?(\d{1,2})\s*\+?\s*(?:years?|שנות|שנים)/u,
    );
    if (
      explicitMinimum &&
      relevantExperienceYears !== null &&
      relevantExperienceYears !== undefined
    ) {
      if (relevantExperienceYears >= Number(explicitMinimum[1]))
        return {
          ...result,
          status: "met",
          evidence: "jobMatching.evidence.educationAlternativeMet",
          nextStep: null,
        };
      if (degreeMissing)
        return {
          ...result,
          status: "gap",
          evidence: "jobMatching.evidence.educationAlternativeGap",
          nextStep: null,
        };
    }
    // An employer's undefined 'equivalent experience' is not a known threshold.
    return {
      ...result,
      evidence: "jobMatching.evidence.educationAlternativeUnknown",
      nextStep: "jobMatching.nextStep.educationAlternative",
    };
  }
  if (degreeMissing)
    return {
      ...result,
      status: "gap",
      evidence: "jobMatching.evidence.educationGap",
      nextStep: null,
    };

  return result;
}

export function evaluateRequirements(
  job: RequirementJob,
  profile: SearchProfile,
  relevantExperienceYears?: number | null,
): RequirementAssessment[] {
  const credentials = [
    {
      pattern: /(?:driving licen[cs]e|driver'?s? licen[cs]e|רישיון נהיגה)/u,
      name: "Driver's license",
      aliases: ["Driver's license", "Driving license", "רישיון נהיגה"],
    },
    {
      pattern:
        /(?:\bcpa\b|certified public accountant|רישיון ראיית חשבון|רואה חשבון מוסמך)/u,
      name: "CPA",
      aliases: ["CPA", "Certified Public Accountant", "רואה חשבון מוסמך"],
    },
    {
      pattern: /(?:\bpmp\b|project management professional)/u,
      name: "PMP",
      aliases: ["PMP", "Project Management Professional"],
    },
    { pattern: /(?:\bcissp\b)/u, name: "CISSP", aliases: ["CISSP"] },
    { pattern: /(?:\bccna\b)/u, name: "CCNA", aliases: ["CCNA"] },
    { pattern: /(?:\bccnp\b)/u, name: "CCNP", aliases: ["CCNP"] },
    {
      pattern:
        /(?:registered nurse|nursing licen[cs]e|רישיון (?:לעיסוק )?בסיעוד|תעודת אח(?:ות)? מוסמ)/u,
      name: "Nursing license",
      aliases: [
        "Registered Nurse",
        "Nursing license",
        "רישיון בסיעוד",
        "תעודת אחות מוסמכת",
      ],
    },
  ];
  const qualificationRequirements: RequirementAssessment[] = [];
  const clauses = (job.requirementsText ?? "")
    .split(/[\n;]|\.\s+/u)
    .slice(0, 24);
  for (const credential of credentials) {
    const clause = clauses.find(
      (value) =>
        credential.pattern.test(normalize(value)) &&
        /(?:\brequired\b|\bmandatory\b|\bmust\b|חובה)/u.test(
          normalize(value),
        ) &&
        !preferred(normalize(value)),
    );
    if (
      !clause ||
      job.requiredSkills.some((value) =>
        credential.pattern.test(normalize(value)),
      )
    )
      continue;
    const candidateEvidence = [
      ...profile.skills,
      ...(profile.qualifications?.education
        .filter((item) => item.status === "completed")
        .flatMap((item) => (item.credential ? [item.credential] : [])) ?? []),
    ];
    const met = candidateEvidence.some((value) =>
      credential.aliases.some((alias) =>
        skillsEquivalent(alias, value, profile.identityCatalog),
      ),
    );
    qualificationRequirements.push({
      requirement: credential.name,
      importance: "must_have",
      status: met ? "met" : "unknown",
      evidence: met
        ? "jobMatching.evidence.skillMet"
        : "jobMatching.evidence.skillUnknown",
      nextStep: met ? null : "jobMatching.nextStep.skill",
    });
  }
  const skills = (
    values: string[],
    importance: RequirementAssessment["importance"],
  ) =>
    values.map((requirement): RequirementAssessment => {
      const evidence = profile.identityCatalog?.qualifications[
        identityTermKey(normalizeEducationTerm(requirement))
      ]
        ? [
            ...profile.skills,
            ...(profile.qualifications?.education
              .filter((item) => item.status === "completed")
              .flatMap((item) => (item.credential ? [item.credential] : [])) ??
              []),
          ]
        : profile.skills;
      const matched = evidence.find((skill) =>
        skillsEquivalent(skill, requirement, profile.identityCatalog),
      );
      return {
        requirement,
        importance,
        status: matched ? "met" : "unknown",
        evidence: matched
          ? "jobMatching.evidence.skillMet"
          : "jobMatching.evidence.skillUnknown",
        nextStep: matched ? null : "jobMatching.nextStep.skill",
      };
    });
  const languages = job.languages.map((requirement): RequirementAssessment => {
    const text = normalize(requirement);
    const importance = preferred(text)
      ? ("important" as const)
      : ("must_have" as const);
    const code = Object.entries(languageNames).find(([, names]) =>
      names.some((name) =>
        name.length <= 2 ? text === name : text.includes(name),
      ),
    )?.[0];
    const candidate = code
      ? profile.languages.find((language) => language.languageCode === code)
      : undefined;
    const requiredLevel = /(?:native|mother tongue|שפת אם)/u.test(text)
      ? 5
      : /(?:fluent|fluency|שוטפ|רמת שפת אם)/u.test(text)
        ? 4
        : /(?:professional|business|מקצועי|עסקית)/u.test(text)
          ? 3
          : /(?:conversational|שיחה)/u.test(text)
            ? 2
            : 1;
    const level = candidate ? languageLevels[candidate.proficiency] : undefined;
    const status =
      level === undefined ? "unknown" : level >= requiredLevel ? "met" : "gap";
    return {
      requirement,
      importance,
      status,
      evidence:
        status === "met"
          ? "jobMatching.evidence.languageMet"
          : status === "gap"
            ? "jobMatching.evidence.languageGap"
            : "jobMatching.evidence.languageUnknown",
      nextStep: status === "unknown" ? "jobMatching.nextStep.language" : null,
    };
  });
  return [
    ...skills(job.requiredSkills, "must_have"),
    ...skills(job.preferredSkills, "important"),
    ...job.educationRequirements.map((value) =>
      educationAssessment(value, profile, relevantExperienceYears),
    ),
    ...languages,
    ...qualificationRequirements,
  ];
}
