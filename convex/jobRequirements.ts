import {
  normalizeEducationTerm,
  identityTermKey,
} from "./referenceIdentityModel";
import type { SearchProfile } from "./jobDiscoveryModel";
import {
  namedSkillsInText,
  resolveSkillIdentity,
  skillsEquivalent,
} from "./skillIdentity";
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
  additionalRequirements?: string[];
};

/** Only explicit OR lists are interchangeable; a slash can name a distinct skill. */
export function skillAlternatives(value: string) {
  if (!/(?:\bor\b|\sאו\s)/iu.test(value)) return [value];
  if (/(?:\band\b|\sוגם\s)/iu.test(value)) return [value];
  const parts = value
    .split(/,\s*|\s+(?:or|או)\s+/iu)
    .map((part) => part.replace(/^(?:or|או)\s+/iu, "").trim())
    .filter(Boolean);
  const named = parts.map(namedSkillsInText);
  // A group with multiple skills is a conjunction unless it is a simple A/B alternative.
  if (
    parts.some(
      (part, index) =>
        named[index].length > 1 &&
        !/^[\p{L}\p{N}+#.]+\s*\/\s*[\p{L}\p{N}+#.]+$/u.test(part),
    )
  )
    return [value];
  return parts.flatMap((part, index) =>
    named[index].length ? named[index] : [part],
  );
}

export function matchingSkill(
  requirement: string,
  evidence: string[],
  profile: Pick<SearchProfile, "identityCatalog">,
) {
  // Knowing a technology never proves a certification or professional license.
  if (
    /(?:certifi(?:ed|cation|cate)|licen[cs]e|רישיון|תעודה|הסמכה)/iu.test(
      requirement,
    )
  )
    return evidence.find((skill) =>
      skillsEquivalent(skill, requirement, profile.identityCatalog),
    );
  if (!/(?:\bor\b|\sאו\s)/iu.test(requirement)) {
    const names = namedSkillsInText(requirement);
    if (names.length) {
      const matches = names.map((name) =>
        evidence.find((skill) =>
          skillsEquivalent(skill, name, profile.identityCatalog),
        ),
      );
      return matches.every(Boolean) ? matches[0] : undefined;
    }
  }
  return evidence.find((skill) =>
    skillAlternatives(requirement).some((alternative) =>
      skillsEquivalent(skill, alternative, profile.identityCatalog),
    ),
  );
}

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

/** Some sources put a simple technology condition in the miscellaneous list.
 * Only fully recognized skill lists can use skill evidence here; preserve
 * clearance, numeric, credential and compound non-skill conditions as unknown. */
function skillOnlyCondition(value: string, profile: SearchProfile) {
  const clean = value
    .replace(
      /^(?:(?:experience|knowledge|proficiency|familiarity|understanding)(?:\s+(?:of|in|with))?\s+|(?:ניסיון|ידע|שליטה|היכרות)\s+(?:ב[-\s]?|עם\s+)?)/iu,
      "",
    )
    .replace(/\s+(?:required|preferred|חובה|יתרון)\s*[.;:]?$/iu, "")
    .replace(/[.;:]$/u, "")
    .trim();
  const parts = clean.split(/\s+(?:or|and|או|וגם)\s+|,\s*|\s*\/\s*/iu);
  return parts.every(
    (part) => resolveSkillIdentity(part.trim(), profile.identityCatalog).known,
  )
    ? clean
    : null;
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
        .flatMap((item) =>
          [item.field, item.credential].filter((value): value is string =>
            Boolean(value),
          ),
        ) ?? []),
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
              .flatMap((item) =>
                [item.field, item.credential].filter((value): value is string =>
                  Boolean(value),
                ),
              ) ?? []),
          ]
        : profile.skills;
      const matched = matchingSkill(requirement, evidence, profile);
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
  const languageLevel = (text: string) =>
    /(?:native|mother tongue|שפת אם)/u.test(text)
      ? 5
      : /(?:fluent|fluency|שוטפ)/u.test(text)
        ? 4
        : /(?:basic|בסיסי)/u.test(text)
          ? 1
          : /(?:conversational|שיחה)/u.test(text)
            ? 2
            : /(?:professional|business|proficien|excellent|strong|good|advanced|מקצועי|עסקית|גבוה|שליטה)/u.test(
                  text,
                )
              ? 3
              : null;
  const languageCodes = (text: string) =>
    Object.entries(languageNames)
      .filter(([, names]) =>
        names.some((name) =>
          name.length <= 2 ? text === name : text.includes(name),
        ),
      )
      .map(([code]) => code);
  const languages = job.languages.map((requirement): RequirementAssessment => {
    const text = normalize(requirement);
    const importance = preferred(text)
      ? ("important" as const)
      : ("must_have" as const);
    const codes = languageCodes(text);
    const parts = text.split(
      /[,;]|\s+(?:and|or|או|וגם)\s+|\s+ו(?=(?:ב)?(?:עברית|אנגלית|ערבית|רוסית))/u,
    );
    const statuses = codes.map((code) => {
      const candidate = profile.languages.find(
        (language) => language.languageCode === code,
      );
      const part =
        parts.find((part) => languageCodes(part).includes(code)) ?? text;
      const requiredLevel = languageLevel(part) ?? languageLevel(text) ?? 1;
      const level = candidate
        ? languageLevels[candidate.proficiency]
        : undefined;
      return level === undefined
        ? ("unknown" as const)
        : level >= requiredLevel
          ? ("met" as const)
          : ("gap" as const);
    });
    const any = /(?:\bor\b|\sאו\s)/u.test(text);
    const mixed = any && /(?:\band\b|\sוגם\s)/u.test(text);
    const status =
      !statuses.length || mixed
        ? ("unknown" as const)
        : any
          ? statuses.includes("met")
            ? ("met" as const)
            : statuses.every((s) => s === "gap")
              ? ("gap" as const)
              : ("unknown" as const)
          : statuses.includes("gap")
            ? ("gap" as const)
            : statuses.every((s) => s === "met")
              ? ("met" as const)
              : ("unknown" as const);
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
  // Some providers put language communication in skills as well as languages.
  // Assess it with the same proficiency evidence rather than exact skill text.
  const assessSkills = (
    values: string[],
    importance: RequirementAssessment["importance"],
  ) =>
    skills(values, importance).map((assessment) => {
      const text = normalize(assessment.requirement);
      const code = Object.entries(languageNames).find(([, names]) =>
        names.some((name) => name.length > 2 && text.includes(name)),
      )?.[0];
      if (
        !code ||
        !/(?:communication|proficiency|fluency|fluent|english|hebrew|אנגלית|עברית)/u.test(
          text,
        )
      )
        return assessment;
      const candidate = profile.languages.find(
        (item) => item.languageCode === code,
      );
      const requiredLevel = /(?:native|mother tongue|שפת אם)/u.test(text)
        ? 5
        : /(?:fluent|fluency|שוטפ)/u.test(text)
          ? 4
          : 3;
      const level = candidate
        ? languageLevels[candidate.proficiency]
        : undefined;
      const status =
        level === undefined
          ? ("unknown" as const)
          : level >= requiredLevel
            ? ("met" as const)
            : ("gap" as const);
      return {
        ...assessment,
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
    ...assessSkills(job.requiredSkills, "must_have"),
    ...assessSkills(job.preferredSkills, "important"),
    ...job.educationRequirements.map((value) =>
      educationAssessment(value, profile, relevantExperienceYears),
    ),
    ...languages,
    ...qualificationRequirements,
    ...(job.additionalRequirements ?? []).map(
      (requirement): RequirementAssessment => {
        const condition = skillOnlyCondition(requirement, profile);
        const matched =
          condition && matchingSkill(condition, profile.skills, profile);
        return {
          requirement,
          status: matched ? "met" : "unknown",
          importance: preferred(normalize(requirement))
            ? "important"
            : "must_have",
          evidence: matched
            ? "jobMatching.evidence.skillMet"
            : "jobMatching.evidence.requirementUnknown",
          nextStep: matched ? null : "jobMatching.nextStep.requirement",
        };
      },
    ),
  ];
}
