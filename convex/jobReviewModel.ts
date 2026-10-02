import { z } from "zod";

const shortText = z.string().trim().min(1).max(180);
const detailText = z.string().trim().min(1).max(240);

export const deepReviewResponseSchema = z.strictObject({
  summary: z.string().trim().min(1).max(360),
  requirementExplanations: z
    .array(
      z.strictObject({
        index: z.number().int().min(0).max(60),
        evidence: detailText,
        nextStep: detailText.nullable(),
      }),
    )
    .max(12),
  resumeKey: z.string().trim().max(40).nullable(),
  resumeRationale: detailText,
  resumeChanges: z
    .array(
      z.strictObject({
        section: shortText,
        change: detailText,
        reason: shortText,
      }),
    )
    .max(4),
  companyWebsiteUrl: z.string().trim().max(2_000).nullable(),
  directApplicationUrl: z.string().trim().max(2_000).nullable(),
  applicationNote: detailText,
  interviewFocus: z.array(detailText).max(5),
  salaryEstimate: z
    .strictObject({
      min: z.number().int().min(1000).max(200000),
      max: z.number().int().min(1000).max(200000),
      currency: z.literal("ILS"),
      period: z.literal("month"),
      basis: detailText,
    })
    .nullable(),
});

export type DeepReviewResponse = z.infer<typeof deepReviewResponseSchema>;

export function usableSalaryEstimate(
  job: { salaryMin: number | null; salaryMax: number | null },
  estimate: DeepReviewResponse["salaryEstimate"],
) {
  if (
    [job.salaryMin, job.salaryMax].some(
      (amount) => amount !== null && Number.isFinite(amount) && amount > 0,
    ) ||
    !estimate ||
    estimate.min > estimate.max
  )
    return null;
  return estimate;
}
