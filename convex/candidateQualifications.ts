import { ConvexError, v, type Infer } from "convex/values";

export const EDUCATION_LEVELS = [
  "secondary",
  "certificate",
  "diploma",
  "associate",
  "bachelor",
  "master",
  "doctorate",
  "other",
] as const;
export const EDUCATION_STATUSES = [
  "completed",
  "in_progress",
  "unknown",
] as const;
export const candidateQualificationsValidator = v.object({
  academicDegreeStatus: v.union(
    v.literal("unknown"),
    v.literal("none"),
    v.literal("completed"),
  ),
  education: v.array(
    v.object({
      level: v.union(...EDUCATION_LEVELS.map((level) => v.literal(level))),
      status: v.union(...EDUCATION_STATUSES.map((status) => v.literal(status))),
      field: v.union(v.string(), v.null()),
      credential: v.union(v.string(), v.null()),
    }),
  ),
});
export type CandidateQualifications = Infer<
  typeof candidateQualificationsValidator
>;

export function normalizeCandidateQualifications(
  input: CandidateQualifications,
  requireCompletionStatus = false,
): CandidateQualifications {
  const invalid = () => {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      field: "qualifications",
      reason: "invalid_qualifications",
    });
  };
  if (input.education.length > 10) invalid();
  const education = input.education.map((item) => ({
    ...item,
    field: item.field?.normalize("NFKC").trim().replace(/\s+/gu, " ") || null,
    credential:
      item.credential?.normalize("NFKC").trim().replace(/\s+/gu, " ") || null,
  }));
  if (
    education.some(
      (item) =>
        (item.field?.length ?? 0) > 160 || (item.credential?.length ?? 0) > 160,
    )
  )
    invalid();
  const completed = education.some(
    (item) =>
      item.status === "completed" &&
      ["bachelor", "master", "doctorate"].includes(item.level),
  );
  if (
    requireCompletionStatus &&
    education.some((item) => item.status === "unknown")
  )
    invalid();
  return {
    academicDegreeStatus: completed ? "completed" : "none",
    education,
  };
}
