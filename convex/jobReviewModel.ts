import { z } from "zod";

const shortText = z.string().trim().min(1).max(180);
const detailText = z.string().trim().min(1).max(240);

export const deepReviewResponseSchema = z.strictObject({
  matchPercentage: z.number().int().min(0).max(100),
  verdict: z.enum(["strong", "good", "stretch", "low"]),
  summary: z.string().trim().min(1).max(360),
  requirements: z
    .array(
      z.strictObject({
        requirement: shortText,
        status: z.enum(["met", "gap", "unknown"]),
        importance: z.enum(["must_have", "important", "minor"]),
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
});

export type DeepReviewResponse = z.infer<typeof deepReviewResponseSchema>;
