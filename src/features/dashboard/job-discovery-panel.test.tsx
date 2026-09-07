import { DirectionProvider } from "@base-ui/react/direction-provider";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import i18n, { initializeI18n } from "@/i18n";
import { JobDiscoveryPanel } from "./job-discovery-panel";

const hooks = vi.hoisted(() => ({
  jobs: [] as Array<Record<string, unknown>>,
  setApplication: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: () => ({ jobs: hooks.jobs }),
  useMutation: () => hooks.setApplication,
}));

function renderPanel(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <DirectionProvider direction={i18n.dir()}>
        <JobDiscoveryPanel />
      </DirectionProvider>
    </MemoryRouter>,
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
    workArrangement: "hybrid",
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: null,
    discoveredAt: Date.UTC(2026, 8, 6),
    lastVerifiedAt: Date.UTC(2026, 8, 7),
    relevanceScore: 0,
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
    hooks.setApplication.mockReset().mockResolvedValue(null);
    await i18n.changeLanguage("en");
  });

  it("presents one scannable card with useful job information", () => {
    renderPanel();

    expect(
      screen.getByRole("heading", { name: "Senior Product Manager" }),
    ).toBeVisible();
    expect(screen.getByText("Acme")).toBeVisible();
    expect(screen.getByText("Tel Aviv-Yafo")).toBeVisible();
    expect(screen.getByText("Hybrid")).toBeVisible();
    expect(screen.getByText(/Posted Sep 5, 2026/)).toBeVisible();
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

  it("keeps a closed job in Hebrew application history with a clear status", async () => {
    await i18n.changeLanguage("he");
    hooks.jobs = [
      job({
        unavailable: true,
        appliedAt: Date.UTC(2026, 8, 6, 10),
      }),
    ];
    const user = userEvent.setup();
    renderPanel("/?tab=in-progress");

    expect(screen.getByText("המשרה כבר לא פעילה")).toBeVisible();
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    await user.click(screen.getByRole("button", { name: "ביטול סימון שליחה" }));
    expect(hooks.setApplication).toHaveBeenCalledExactlyOnceWith({
      jobId: "jobs:one",
      applied: false,
    });
  });
});
