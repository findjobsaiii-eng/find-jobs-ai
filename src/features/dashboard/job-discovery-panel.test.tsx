import { DirectionProvider } from "@base-ui/react/direction-provider";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import i18n, { initializeI18n } from "@/i18n";
import { JobDiscoveryPanel } from "./job-discovery-panel";

const hooks = vi.hoisted(() => ({
  jobs: [] as Array<Record<string, unknown>>,
  timeline: [] as Array<Record<string, unknown>>,
  discoveryState: "complete" as "pending" | "running" | "complete" | "failed",
  setApplication: vi.fn(),
  runReview: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: (_query: unknown, args: unknown) =>
    typeof args === "object" && args !== null && "jobId" in args
      ? hooks.timeline
      : {
          jobs: hooks.jobs,
          plan: "pro",
          discoveryState: hooks.discoveryState,
        },
  useMutation: () => hooks.setApplication,
  useAction: () => hooks.runReview,
}));

function renderPanel(path = "/") {
  const view = path.includes("tab=in-progress")
    ? ("inProgress" as const)
    : ("suggestions" as const);
  return render(
    <DirectionProvider direction={i18n.dir()}>
      <JobDiscoveryPanel view={view} />
    </DirectionProvider>,
  );
}

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: "jobs:one",
    title: "Senior Product Manager",
    companyName: "Acme",
    descriptionText:
      "Lead a focused commerce team and turn customer needs into clear product outcomes.",
    requiredSkills: ["Product strategy", "Analytics", "Leadership"],
    postedAt: "2026-09-05T09:00:00.000Z",
    unavailable: false,
    sourceUrl: "https://jobs.acme.example/roles/123",
    sourceName: "Acme Careers",
    sourceTier: "employer",
    locationText: "Tel Aviv-Yafo",
    locationNames: { en: "Tel Aviv", he: "תל אביב" },
    workArrangement: "hybrid",
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: null,
    discoveredAt: Date.UTC(2026, 8, 6),
    lastVerifiedAt: Date.UTC(2026, 8, 7),
    relevanceScore: 82,
    matchQuality: "strong",
    scoreComponents: {
      role: 30,
      requiredSkills: 14,
      preferredSkills: 4,
      experience: 10,
      location: 5,
      workArrangement: 0,
      employmentType: 0,
      language: 0,
      education: 0,
      semantic: 0,
      domain: 10,
      seniority: 6,
      preferences: 3,
    },
    matchHighlights: {
      targetRole: "Product Manager",
      skills: ["Product strategy", "Analytics"],
      domain: "Product",
      location: true,
    },
    matchReasons: [],
    resultSource: "central",
    ...overrides,
  };
}

describe("job result cards", () => {
  beforeAll(async () => {
    await initializeI18n();
  });

  beforeEach(async () => {
    hooks.jobs = [job()];
    hooks.timeline = [];
    hooks.discoveryState = "complete";
    hooks.setApplication.mockReset().mockResolvedValue(null);
    hooks.runReview.mockReset().mockResolvedValue(null);
    await i18n.changeLanguage("en");
  });

  it("shows a warm Hebrew search-in-progress state before discovery completes", async () => {
    await i18n.changeLanguage("he");
    hooks.jobs = [];
    hooks.discoveryState = "pending";

    renderPanel();

    expect(
      screen.getByRole("heading", {
        name: "כבר מחפשים עבורך משרות",
      }),
    ).toBeVisible();
    expect(screen.getByText(/אפשר לחזור בעוד כמה דקות/)).toBeVisible();
    expect(
      screen.queryByText("לא נמצאו כרגע משרות שמתאימות לפרופיל שלך."),
    ).not.toBeInTheDocument();
  });

  it("presents one scannable card with useful job information", () => {
    renderPanel();

    expect(
      screen.getByRole("heading", { name: "Senior Product Manager" }),
    ).toBeVisible();
    expect(screen.getByText("Acme")).toBeVisible();
    expect(screen.getByText("Tel Aviv")).toBeVisible();
    expect(screen.queryByText("Tel Aviv-Yafo")).not.toBeInTheDocument();
    expect(screen.getByText("Hybrid")).toBeVisible();
    expect(screen.getByText(/^Posted /)).toHaveAttribute(
      "datetime",
      "2026-09-05T09:00:00.000Z",
    );
    expect(screen.getByText(/Lead a focused commerce team/)).toBeVisible();
    expect(screen.getByText("Product strategy")).toBeVisible();
    expect(
      screen.getByText(/Source: Acme Careers.*Employer careers page/),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "View job" })).toHaveAttribute(
      "href",
      "https://jobs.acme.example/roles/123",
    );
    expect(screen.queryByText(/rawProviderJson/i)).not.toBeInTheDocument();
  });

  it("shows the deterministic score and its exact point breakdown", async () => {
    const user = userEvent.setup();
    renderPanel();

    const score = screen.getByRole("button", {
      name: "High match, match score 82 out of 100 — show calculation",
    });
    expect(score).toBeVisible();
    await user.hover(score);

    expect(await screen.findByText("Role match")).toBeVisible();
    expect(screen.getByText("+30/35")).toBeVisible();
    expect(screen.getByText("+18/25")).toBeVisible();
    expect(
      screen.getByText("Matched skills: Product strategy · Analytics"),
    ).toBeVisible();
  });

  it("labels a sub-58 eligible job as a partial match without hiding it", () => {
    hooks.jobs = [
      job({
        title: "E-commerce Operations Coordinator",
        relevanceScore: 52,
        matchQuality: "partial",
      }),
    ];

    renderPanel();

    expect(
      screen.getByRole("heading", {
        name: "E-commerce Operations Coordinator",
      }),
    ).toBeVisible();
    expect(screen.getByText("Partial match · 52/100")).toBeVisible();
    expect(
      screen.getByText(
        "Relevant professional overlap, with some requirements less closely aligned",
      ),
    ).toBeVisible();
  });

  it("localizes an unresolved remote location instead of showing provider copy", () => {
    hooks.jobs = [
      job({
        locationNames: undefined,
        locationText: "Remote, Israel",
        workArrangement: "remote",
      }),
    ];

    renderPanel();

    expect(screen.getByText("Location flexible")).toBeVisible();
    expect(screen.queryByText("Remote, Israel")).not.toBeInTheDocument();
  });

  it("keeps a closed job in Hebrew application history with a clear status", async () => {
    await i18n.changeLanguage("he");
    hooks.jobs = [
      job({
        unavailable: true,
        appliedAt: Date.UTC(2026, 8, 6, 10),
        trackingStatus: "applied",
        trackingUpdatedAt: Date.UTC(2026, 8, 7, 10),
      }),
    ];
    const user = userEvent.setup();
    renderPanel("/?tab=in-progress");

    expect(screen.getByText("המשרה כבר לא פעילה")).toBeVisible();
    expect(screen.getByText("תל אביב")).toBeVisible();
    expect(screen.queryByText("Tel Aviv-Yafo")).not.toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    expect(screen.getByText("נשלחו קורות חיים")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "הסרה" }));
    expect(hooks.setApplication).toHaveBeenCalledExactlyOnceWith({
      jobId: "jobs:one",
      applied: false,
    });
  });

  it("saves a suggestion without marking it as applied", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(
      screen.getByRole("button", { name: "Choose how to save this job" }),
    );
    await user.click(screen.getByRole("button", { name: "Saved" }));

    expect(hooks.setApplication).toHaveBeenCalledExactlyOnceWith({
      jobId: "jobs:one",
      status: "saved",
    });
  });

  it("lets a saved suggestion move directly to another status", async () => {
    hooks.jobs = [job({ trackingStatus: "saved" })];
    const user = userEvent.setup();
    renderPanel();

    await user.click(
      screen.getByRole("button", { name: "Choose how to save this job" }),
    );
    await user.click(screen.getByRole("button", { name: "Applied" }));
    expect(hooks.setApplication).toHaveBeenCalledWith({
      jobId: "jobs:one",
      status: "applied",
    });
  });

  it("edits a tracked status and notes in an accessible dialog", async () => {
    hooks.jobs = [
      job({
        trackingStatus: "applied",
        trackingNotes: "Waiting for a reply.",
        trackingUpdatedAt: Date.UTC(2026, 8, 7, 10),
      }),
    ];
    const user = userEvent.setup();
    renderPanel("/?tab=in-progress");

    await user.click(screen.getByRole("button", { name: "Update" }));
    expect(
      screen.getByRole("heading", { name: "Application tracking" }),
    ).toBeVisible();
    expect(screen.getAllByRole("radio")).toHaveLength(10);
    expect(screen.getByRole("radio", { name: "Applied" })).toBeChecked();
    const interviewStatus = screen.getByRole("radio", { name: "Interview" });
    await user.click(interviewStatus);
    expect(interviewStatus).toBeChecked();
    const notes = screen.getByRole("textbox", {
      name: "Comment (optional)",
    });
    await user.clear(notes);
    await user.type(notes, "Interview with the product lead.");
    await user.click(
      screen.getByRole("button", { name: "Save status update" }),
    );

    expect(hooks.setApplication).toHaveBeenCalledWith({
      jobId: "jobs:one",
      status: "interview",
      notes: "Interview with the product lead.",
    });
  });

  it("adds a standalone note without changing the current status", async () => {
    hooks.jobs = [job({ trackingStatus: "phone_screen" })];
    const user = userEvent.setup();
    renderPanel("/?tab=in-progress");

    await user.click(screen.getByRole("button", { name: "Update" }));
    await user.type(
      screen.getByRole("textbox", { name: "Note" }),
      "Send the recruiter my availability.",
    );
    await user.click(screen.getByRole("button", { name: "Add to timeline" }));

    expect(hooks.setApplication).toHaveBeenCalledWith({
      jobId: "jobs:one",
      status: "phone_screen",
      notes: "Send the recruiter my availability.",
    });
  });

  it("requests and opens a saved deep AI review", async () => {
    hooks.jobs = [
      job({
        deepReview: {
          status: "completed",
          language: "en",
          stale: false,
          matchPercentage: 86,
          verdict: "good",
          summary: "Your product experience maps well to this role.",
          strengths: [
            { title: "Product strategy", detail: "Strong relevant evidence." },
          ],
          gaps: [
            {
              requirement: "Python",
              currentEvidence: "Python is not shown in the selected resume.",
              howToClose: "Do not claim it without real experience.",
              importance: "minor",
            },
          ],
          resumeName: "Product CV",
          resumeRationale: "This version best shows product ownership.",
          resumeChanges: [],
          directApplicationUrl: "https://careers.acme.example/roles/123",
          companyWebsiteUrl: "https://acme.example",
          applicationNote: "Apply directly through Acme.",
          interviewFocus: ["Prepare one product tradeoff example."],
          updatedAt: Date.now(),
        },
      }),
    ];
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Deep review · 86%" }));
    expect(screen.getByText("AI deep review")).toBeInTheDocument();
    expect(screen.getByText("Python")).toBeInTheDocument();
    expect(
      screen.getByText("Best existing version: Product CV"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Apply directly" }),
    ).toHaveAttribute("href", "https://careers.acme.example/roles/123");
  });

  it("starts a Hebrew deep review with the selected job", async () => {
    await i18n.changeLanguage("he");
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "סקירה מעמיקה" }));
    expect(hooks.runReview).toHaveBeenCalledExactlyOnceWith({
      jobId: "jobs:one",
      language: "he",
    });
  });
});
