import type { TFunction } from "i18next";

export function requirementLabel(t: TFunction, requirement: string): string {
  const experience = requirement.match(
    /^(\d+)\+ years of relevant experience$/u,
  );
  return experience
    ? t("jobMatching.requirements.experience", { years: experience[1] })
    : requirement;
}
