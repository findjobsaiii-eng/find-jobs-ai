import { z } from "zod";

const shortText = z.string().trim().min(1).max(240);
const detailText = z.string().trim().min(1).max(900);

export const deepReviewResponseSchema = z.object({
  matchPercentage: z.number().int().min(0).max(100),
  verdict: z.enum(["strong", "good", "stretch", "low"]),
  summary: z.string().trim().min(1).max(1_500),
  strengths: z.array(z.object({ title: shortText, detail: detailText })).max(5),
  gaps: z
    .array(
      z.object({
        requirement: shortText,
        currentEvidence: detailText,
        howToClose: detailText,
        importance: z.enum(["must_have", "important", "minor"]),
      }),
    )
    .max(7),
  resumeKey: z.string().trim().max(40).nullable(),
  resumeRationale: z.string().trim().min(1).max(1_000),
  resumeChanges: z
    .array(
      z.object({
        section: shortText,
        change: detailText,
        reason: detailText,
      }),
    )
    .max(7),
  companyWebsiteUrl: z.string().trim().max(2_000).nullable(),
  directApplicationUrl: z.string().trim().max(2_000).nullable(),
  applicationNote: z.string().trim().min(1).max(900),
  interviewFocus: z.array(detailText).max(6),
});

export type DeepReviewResponse = z.infer<typeof deepReviewResponseSchema>;
