import { DirectionProvider } from "@base-ui/react/direction-provider";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import i18n, { initializeI18n } from "@/i18n";
import { JobDiscoveryPanel } from "./job-discovery-panel";

const hooks = vi.hoisted(() => ({
  jobs: [] as Array<Record<string, unknown>>,
  discoveryState: "complete" as "pending" | "running" | "complete" | "failed",
  setApplication: vi.fn(),
  runReview: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: () => ({
    jobs: hooks.jobs,
    plan: "pro",
    discoveryState: hooks.discoveryState,
  }),
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
    hooks.discoveryState = "complete";
    hooks.setApplication.mockReset().mockResolvedValue(null);
    hooks.runReview.mockReset().mockResolvedValue(null);
    await i18n.changeLanguage("en");
  });

  it("describes an empty Saved view using the current status workflow", async () => {
    await i18n.changeLanguage("he");
    hooks.jobs = [];

    renderPanel("/?tab=in-progress");

    expect(
      screen.getByRole("heading", { name: "עדיין אין משרות שמורות" }),
    ).toBeVisible();
    expect(
      screen.getByText("בחרו סטטוס למשרה בהצעות, והיא תופיע כאן."),
    ).toBeVisible();
  });

  it("hides status filters when every saved job has the same status", () => {
    hooks.jobs = [job({ trackingStatus: "saved" })];

    renderPanel("/?tab=in-progress");

    expect(
      screen.queryByLabelText("Filter applications by stage"),
    ).not.toBeInTheDocument();
  });

  it("shows only statuses in use, with All first, and filters exactly", async () => {
    hooks.jobs = [
      job({
        id: "jobs:applied",
        title: "Applied role",
        trackingStatus: "applied",
      }),
      job({
        id: "jobs:interview",
        title: "Interview role",
        trackingStatus: "interview",
      }),
    ];
    const user = userEvent.setup();

    renderPanel("/?tab=in-progress");

    const filters = screen.getByLabelText("Filter applications by stage");
    const buttons = within(filters).getAllByRole("button");
    expect(buttons).toHaveLength(3);
    expect(buttons[0]).toHaveTextContent("All");
    expect(buttons[1]).toHaveTextContent("Applied");
    expect(buttons[2]).toHaveTextContent("Interview");
    expect(within(filters).queryByText("Saved")).not.toBeInTheDocument();

    await user.click(buttons[2]);
    expect(
      screen.getByRole("heading", { name: "Interview role" }),
    ).toBeVisible();
    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "Applied role" }),
      ).not.toBeInTheDocument();
    });
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
    const score = screen.getByRole("button", {
      name: "Partial match, match score 52 out of 100 — show calculation",
    });
    expect(
      within(score).getByText("Partial match · 52/100"),
    ).toBeInTheDocument();
    expect(within(score).getByText("52/100")).toBeInTheDocument();
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
    await user.click(
      screen.getByRole("button", { name: "שינוי סטטוס: נשלחו קורות חיים" }),
    );
    await user.click(screen.getByRole("button", { name: "הסרה מהשמורות" }));
    expect(hooks.setApplication).toHaveBeenCalledExactlyOnceWith({
      jobId: "jobs:one",
    });
  });

  it("saves a suggestion without marking it as applied", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(
      screen.getByRole("button", { name: "Choose how to save this job" }),
    );
    await user.click(screen.getByRole("button", { name: "Saved" }));
    expect(
      screen.getByRole("heading", { name: "Add a comment?" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Update status" }));

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
      screen.getByRole("button", { name: "Change status: Saved" }),
    );
    await user.click(screen.getByRole("button", { name: "Applied" }));
    await user.click(screen.getByRole("button", { name: "Update status" }));
    expect(hooks.setApplication).toHaveBeenCalledWith({
      jobId: "jobs:one",
      status: "applied",
    });
    expect(screen.getByRole("status")).toHaveTextContent("Moved to Saved.");
  });

  it("changes a tracked status with an attached comment", async () => {
    hooks.jobs = [
      job({
        trackingStatus: "applied",
        trackingUpdatedAt: Date.UTC(2026, 8, 7, 10),
      }),
    ];
    const user = userEvent.setup();
    renderPanel("/?tab=in-progress");

    await user.click(
      screen.getByRole("button", { name: "Change status: Applied" }),
    );
    await user.click(screen.getByRole("button", { name: "Interview" }));
    expect(
      screen.queryByText(/changing Senior Product Manager to Interview/),
    ).not.toBeInTheDocument();
    const notes = screen.getByRole("textbox", { name: "Comment" });
    await user.type(notes, "Interview with the product lead.");
    await user.click(screen.getByRole("button", { name: "Update status" }));

    expect(hooks.setApplication).toHaveBeenCalledWith({
      jobId: "jobs:one",
      status: "interview",
      note: "Interview with the product lead.",
    });
  });

  it("adds a standalone comment without changing the current status", async () => {
    hooks.jobs = [job({ trackingStatus: "phone_screen" })];
    const user = userEvent.setup();
    renderPanel("/?tab=in-progress");

    await user.click(screen.getByRole("button", { name: "Add a comment" }));
    await user.type(
      screen.getByRole("textbox", { name: "Comment" }),
      "Send the recruiter my availability.",
    );
    await user.click(screen.getByRole("button", { name: "Add comment" }));

    expect(hooks.setApplication).toHaveBeenCalledWith({
      jobId: "jobs:one",
      note: "Send the recruiter my availability.",
    });
  });

  it("adds a comment to an untracked suggestion without assigning a status", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Add a comment" }));
    await user.type(
      screen.getByRole("textbox", { name: "Comment" }),
      "Ask whether the team works remotely.",
    );
    await user.click(screen.getByRole("button", { name: "Add comment" }));

    expect(hooks.setApplication).toHaveBeenCalledExactlyOnceWith({
      jobId: "jobs:one",
      note: "Ask whether the team works remotely.",
    });
    expect(screen.getByRole("status")).toHaveTextContent("Comment added.");
  });

  it("shows application history inline below key skills", () => {
    hooks.jobs = [
      job({
        trackingStatus: "interview",
        trackingTimeline: [
          {
            id: "events:two",
            kind: "note",
            note: "Prepare the product case study.",
            createdAt: Date.UTC(2026, 8, 8, 10),
          },
          {
            id: "events:one",
            kind: "status_change",
            status: "interview",
            createdAt: Date.UTC(2026, 8, 7, 10),
          },
        ],
      }),
    ];

    renderPanel("/?tab=in-progress");

    const skillsHeading = screen.getByRole("heading", { name: "Key skills" });
    const timeline = screen.getByRole("region", { name: "Timeline" });
    expect(skillsHeading.compareDocumentPosition(timeline)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.getByText("Prepare the product case study.")).toBeVisible();
    expect(screen.getByText("Status changed to Interview")).toBeVisible();
    expect(screen.queryByText(/^Applied /)).not.toBeInTheDocument();
  });

  it("shows status removal as history instead of deleting the timeline", () => {
    hooks.jobs = [
      job({
        trackingTimeline: [
          {
            id: "events:removed",
            kind: "status_removed",
            previousStatus: "saved",
            createdAt: Date.UTC(2026, 8, 9, 10),
          },
          {
            id: "events:note",
            kind: "note",
            note: "Keep this contact for later.",
            createdAt: Date.UTC(2026, 8, 8, 10),
          },
        ],
      }),
    ];

    renderPanel();

    expect(screen.getByText("Saved status removed")).toBeVisible();
    expect(screen.getByText("Keep this contact for later.")).toBeVisible();
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
