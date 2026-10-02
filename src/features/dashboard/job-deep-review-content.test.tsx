import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import i18n, { initializeI18n } from "@/i18n";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  DeepReviewContent,
  type DeepReview,
  type ReviewJobFacts,
} from "./job-deep-review-content";

const first = "resumeDocuments:first" as Id<"resumeDocuments">;
const second = "resumeDocuments:second" as Id<"resumeDocuments">;
const review: DeepReview = {
  status: "completed",
  language: "en",
  stale: false,
  updatedAt: 1,
  summary: "Relevant frontend experience.",
  matchPercentage: 80,
  verdict: "good",
  resumeOptions: [
    { id: first, name: "My CV" },
    { id: second, name: "My CV" },
  ],
  resumeId: second,
  directApplicationUrl: "https://example.com/jobs/react",
  companyWebsiteUrl: "https://example.com",
  requirements: [
    {
      requirement: "React",
      status: "unknown",
      importance: "must_have",
      evidence: "No React evidence was supplied.",
      nextStep: "Add a real example if you have one.",
    },
    {
      requirement: "TypeScript",
      status: "unknown",
      importance: "important",
      evidence: "Experience is not stated.",
      nextStep: null,
    },
  ],
};
const facts: ReviewJobFacts = {
  sourceUrl: "https://example.com/jobs/react",
  locationText: "Tel Aviv",
  locationNames: { en: "Tel Aviv", he: "תל אביב" },
  workArrangement: "hybrid",
  employmentType: "full-time",
  activityConfidence: "probable",
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: null,
  salaryPeriod: null,
};

beforeEach(async () => {
  await initializeI18n();
  await i18n.changeLanguage("en");
});

describe("visual review decisions", () => {
  it("labels guesses and prefers published pay over an existing estimate", () => {
    const estimatedReview = {
      ...review,
      salaryEstimate: {
        min: 18000,
        max: 25000,
        currency: "ILS" as const,
        period: "month" as const,
        basis: "Based on a mid-level frontend role.",
      },
    };
    const view = render(
      <DeepReviewContent
        review={estimatedReview}
        facts={facts}
        unavailable={false}
      />,
    );
    expect(screen.getByText("AI estimate · guessed")).toBeVisible();
    expect(screen.getByText("₪18,000 – ₪25,000")).toBeVisible();
    view.rerender(
      <DeepReviewContent
        review={estimatedReview}
        facts={{
          ...facts,
          salaryMin: 20000,
          salaryMax: 30000,
          salaryCurrency: "ILS",
          salaryPeriod: "month",
        }}
        unavailable={false}
      />,
    );
    expect(screen.queryByText("AI estimate · guessed")).not.toBeInTheDocument();
    expect(screen.getByText("₪20,000 – ₪30,000")).toBeVisible();
  });
  it("shows the published salary range and its original period", () => {
    render(
      <DeepReviewContent
        review={review}
        facts={{
          ...facts,
          salaryMin: 15000,
          salaryMax: 20000,
          salaryCurrency: "ILS",
          salaryPeriod: "month",
        }}
        unavailable={false}
      />,
    );
    const salary = screen.getByRole("region", { name: "Salary range" });
    expect(within(salary).getByText("₪15,000 – ₪20,000")).toBeVisible();
    expect(within(salary).getByText("Per month")).toBeVisible();
  });
  it("does not invent salary when missing or contradictory", () => {
    render(
      <DeepReviewContent
        review={review}
        facts={{ ...facts, salaryMin: 20000, salaryMax: 10000 }}
        unavailable={false}
      />,
    );
    expect(screen.getByText("Salary not published")).toBeVisible();
  });
  it("shows a maximum-only salary without inventing a lower bound", () => {
    render(
      <DeepReviewContent
        review={review}
        facts={{
          ...facts,
          salaryMax: 120,
          salaryCurrency: "ILS",
          salaryPeriod: "hour",
        }}
        unavailable={false}
      />,
    );
    expect(screen.getByText("Up to ₪120")).toBeVisible();
    expect(screen.getByText("Per hour")).toBeVisible();
  });
  it("highlights the recommended resume by ID when names are identical", () => {
    render(
      <DeepReviewContent review={review} facts={facts} unavailable={false} />,
    );
    const cards = within(
      screen.getByRole("list", { name: "Resumes compared for this review" }),
    ).getAllByRole("listitem");
    expect(within(cards[0]).getByText("Also compared")).toBeVisible();
    expect(within(cards[1]).getByText("Recommended")).toBeVisible();
  });
  it("removes the apply action for a closed job while keeping the company link", () => {
    render(<DeepReviewContent review={review} facts={facts} unavailable />);
    expect(
      screen.queryByRole("link", { name: "Apply directly" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Company website" }),
    ).toHaveAttribute("href", "https://example.com");
    expect(screen.getByText("No longer available")).toBeVisible();
  });
  it("retains uncertainty and localizes Hebrew counts and job facts", async () => {
    await i18n.changeLanguage("he");
    render(
      <div dir="rtl">
        <DeepReviewContent review={review} facts={facts} unavailable={false} />
      </div>,
    );
    expect(screen.getByText("2 לבדיקה")).toBeVisible();
    expect(screen.getAllByText("צריך לבדוק")).toHaveLength(2);
    expect(screen.getByText("כנראה פתוחה")).toBeVisible();
    expect(screen.getByText("תל אביב")).toBeVisible();
    expect(screen.getByText("היברידי")).toBeVisible();
    expect(
      screen.getByText("No React evidence was supplied."),
    ).not.toBeVisible();
  });
  it("explains server-derived uncertain experience in Hebrew on demand", async () => {
    await i18n.changeLanguage("he");
    render(
      <DeepReviewContent
        review={{
          ...review,
          requirements: [
            {
              requirement: "3+ years of relevant experience",
              status: "unknown",
              importance: "must_have",
              evidence: "jobMatching.evidence.experienceUnknown",
              nextStep: "jobMatching.nextStep.experience",
            },
          ],
        }}
        facts={facts}
        unavailable={false}
      />,
    );
    const requirement = screen.getByText("לפחות 3 שנות ניסיון רלוונטי");
    const evidence = screen.getByText(
      "הניסיון שלך בתחום הרלוונטי עדיין לא אושר.",
    );
    expect(evidence).not.toBeVisible();
    await userEvent.click(requirement.closest("summary")!);
    expect(evidence).toBeVisible();
    expect(
      screen.getByText("כדאי לאשר את הניסיון שלך בתחום הרלוונטי."),
    ).toBeVisible();
  });
});
