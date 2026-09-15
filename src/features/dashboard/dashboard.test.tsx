import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import i18n, { initializeI18n } from "@/i18n";
import { ProfileGate } from "@/features/profile/profile-gate";
import { ProfileOverview } from "@/features/profile/profile-overview";
import type { CurrentProfile } from "@/features/profile/profile-types";
import type { FunctionArgs } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import { AuthenticatedShell } from "./authenticated-shell";
import { useJobViewNavigation } from "./app-routes";
import { DashboardLoadingScreen, DashboardScreen } from "./dashboard-screen";

const hooks = vi.hoisted(() => ({
  data: null as CurrentProfile | null | undefined,
  resume: null as { status: string } | null | undefined,
  push: vi.fn(),
  replace: vi.fn(),
  save: vi.fn<
    (
      args: FunctionArgs<typeof api.candidateProfiles.saveCurrent>,
    ) => Promise<void>
  >(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/profile",
  useRouter: () => ({ push: hooks.push, replace: hooks.replace }),
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (ref: unknown, args?: { kind?: string }) => {
      if (args?.kind) return [];
      const name = getFunctionName(ref as never);
      if (name === "candidateProfiles:getCurrent") return hooks.data;
      if (name === "resumes:getCurrent") return hooks.resume;
      return args ? { jobs: [] } : null;
    },
    useMutation: () => hooks.save,
    useAction: () => vi.fn(),
  };
});

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signOut: vi.fn() }),
}));

vi.mock("@/lib/google-maps", () => ({
  hasGoogleMapsApiKey: () => false,
  loadGooglePlaces: vi.fn(),
}));

function completedProfile(): CurrentProfile {
  return {
    identity: {
      userId: "users:one",
      email: "candidate@example.com",
      googleDisplayName: "Google Name",
      profileImage: null,
    },
    profile: {
      _id: "candidateProfiles:one",
      _creationTime: 1,
      userId: "users:one",
      email: "candidate@example.com",
      preferredDisplayName: "Matan",
      targetJobTitleIds: ["catalogItems:role"],
      professionalSummary:
        "Experienced engineer building accessible and responsive applications.",
      yearsOfExperience: 0,
      skillIds: ["catalogItems:skill"],
      preferredPlaceIds: ["place-one"],
      locationRadiusKm: 40,
      primaryLocation: {
        placeId: "place-one",
        formattedAddress: "Tel Aviv-Yafo, Israel",
        city: "Tel Aviv-Yafo",
        administrativeArea: "Tel Aviv District",
        country: "Israel",
        countryCode: "IL",
        latitude: 32.0853,
        longitude: 34.7818,
        radiusKm: 40,
      },
      workArrangements: ["hybrid"],
      employmentTypes: ["full-time"],
      minimumMonthlySalaryIls: 15000,
      languages: [{ languageCode: "he", proficiency: "native" }],
      onboardingCompleted: true,
      onboardingStep: 4,
      completedAt: 10,
      createdAt: 1,
      updatedAt: 10,
    },
    selections: {
      targetJobTitles: [
        {
          id: "catalogItems:role",
          labelEn: "Engineer",
          labelHe: "מהנדס",
          isCustom: false,
        },
      ],
      skills: [
        {
          id: "catalogItems:skill",
          labelEn: "React",
          labelHe: "React",
          isCustom: false,
        },
      ],
    },
  } as unknown as CurrentProfile;
}

function renderProfile(
  section: "professional" | "preferences" = "professional",
) {
  return render(
    <ProfileOverview data={completedProfile()} activeSection={section} />,
  );
}

describe("dashboard and completed profile editing", () => {
  beforeAll(async () => {
    await initializeI18n();
  });

  beforeEach(async () => {
    hooks.data = completedProfile();
    hooks.resume = null;
    hooks.push.mockReset();
    hooks.replace.mockReset();
    hooks.save.mockReset();
    await i18n.changeLanguage("en");
  });

  it("gates completed and incomplete profiles before rendering app content", () => {
    const view = render(
      <ProfileGate>
        {(data) => <p>{data.profile?.preferredDisplayName}</p>}
      </ProfileGate>,
    );
    expect(screen.getByText("Matan")).toBeInTheDocument();

    view.unmount();
    hooks.data = { ...completedProfile(), profile: null };
    render(<ProfileGate>{() => <p>Protected content</p>}</ProfileGate>);
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Drop a resume here or click to browse",
      }),
    ).toBeInTheDocument();
  });

  it("renders the dashboard shell while the profile is loading", () => {
    hooks.data = undefined;
    hooks.resume = undefined;

    render(
      <ProfileGate
        loading={
          <AuthenticatedShell currentPage="jobs" jobView="suggestions">
            <DashboardLoadingScreen view="suggestions" />
          </AuthenticatedShell>
        }
      >
        {() => <p>Protected content</p>}
      </ProfileGate>,
    );

    expect(screen.getByRole("link", { name: "JOBMITER" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "Suggestions" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("status", { name: "Loading discovered jobs…" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("opens the full editable onboarding review after CV extraction", async () => {
    const user = userEvent.setup();
    const data = completedProfile();
    hooks.data = {
      ...data,
      profile: {
        ...data.profile!,
        onboardingCompleted: false,
        onboardingStep: 1,
        cvReviewPending: true,
      },
    } as CurrentProfile;
    hooks.resume = { status: "ready" };

    render(<ProfileGate>{() => <p>Protected content</p>}</ProfileGate>);

    expect(
      screen.getByRole("heading", { name: "Let's review your profile" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Engineer")).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByRole("combobox", {
        name: "Which skills and tools do you know?",
      }),
    ).toBeInTheDocument();
    expect(await screen.findByText("React")).toBeInTheDocument();
  });

  it("moves from the upload gate into manual profile onboarding", async () => {
    const user = userEvent.setup();
    hooks.data = { ...completedProfile(), profile: null };

    render(<ProfileGate>{() => <p>Protected content</p>}</ProfileGate>);

    await user.click(
      screen.getByRole("button", { name: "Fill in my profile manually" }),
    );

    expect(
      screen.getByRole("heading", {
        name: "Let's build your profile",
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to CV upload" }));

    expect(
      screen.getByRole("heading", { name: "Upload your CV" }),
    ).toBeInTheDocument();
  });

  it("renders the shared app shell with URL-backed job tabs and profile link", async () => {
    await i18n.changeLanguage("he");
    const user = userEvent.setup();
    const data = completedProfile();
    render(
      <AuthenticatedShell data={data} currentPage="jobs" jobView="suggestions">
        <DashboardScreen view="suggestions" onEdit={vi.fn()} />
      </AuthenticatedShell>,
    );

    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    expect(
      screen.getByRole("heading", { name: "משרות מומלצות עבורך" }),
    ).toBeInTheDocument();
    const suggestionsTab = screen.getByRole("link", { name: "הצעות" });
    const savedTab = screen.getByRole("link", { name: "שמורות" });
    expect(suggestionsTab).toHaveAttribute("href", "/");
    expect(savedTab).toHaveAttribute("href", "/?tab=in-progress");
    expect(suggestionsTab.querySelector("svg")).not.toBeNull();
    expect(savedTab.querySelector("svg")).not.toBeNull();
    expect(
      suggestionsTab.querySelector("[data-job-tab-indicator]"),
    ).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "תפריט משתמש" }));
    expect(screen.getByRole("link", { name: "פרופיל" })).toHaveAttribute(
      "href",
      "/profile",
    );
  });

  it("switches job tabs immediately and keeps browser history in sync", () => {
    window.history.replaceState(null, "", "/");
    const { result } = renderHook(() => useJobViewNavigation("suggestions"));

    act(() => result.current.selectView("inProgress"));
    expect(result.current.view).toBe("inProgress");
    expect(window.location.search).toBe("?tab=in-progress");

    act(() => {
      window.history.pushState(null, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current.view).toBe("suggestions");
  });

  it("intercepts tab links for an immediate in-place view change", async () => {
    const user = userEvent.setup();
    const onJobViewChange = vi.fn();
    render(
      <AuthenticatedShell
        currentPage="jobs"
        jobView="suggestions"
        onJobViewChange={onJobViewChange}
      >
        <p>Jobs</p>
      </AuthenticatedShell>,
    );

    await user.click(screen.getByRole("link", { name: "Saved" }));
    expect(onJobViewChange).toHaveBeenCalledWith("inProgress");
  });

  it("uses the server-selected jobs view instead of client URL parsing", () => {
    render(
      <AuthenticatedShell
        data={completedProfile()}
        currentPage="jobs"
        jobView="inProgress"
      >
        <DashboardScreen view="inProgress" onEdit={vi.fn()} />
      </AuthenticatedShell>,
    );

    expect(screen.getByRole("link", { name: "Saved" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("heading", { name: "Saved jobs" }),
    ).toBeInTheDocument();
  });

  it("links every profile topic to a real route and guards dirty navigation", async () => {
    const user = userEvent.setup();
    renderProfile();

    expect(screen.getByRole("link", { name: "Preferences" })).toHaveAttribute(
      "href",
      "/profile/preferences",
    );
    expect(screen.getByRole("link", { name: "Languages" })).toHaveAttribute(
      "href",
      "/profile/languages",
    );
    expect(screen.getByRole("link", { name: "Resumes" })).toHaveAttribute(
      "href",
      "/profile/resumes",
    );

    const name = screen.getByRole("textbox", {
      name: "What should we call you?",
    });
    await user.clear(name);
    await user.type(name, "Unsaved Name");
    await user.click(screen.getByRole("link", { name: "Preferences" }));

    expect(
      screen.getByRole("alertdialog", {
        name: "Discard your unsaved profile changes?",
      }),
    ).toBeInTheDocument();
    expect(hooks.push).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(hooks.push).toHaveBeenCalledWith("/profile/preferences");
  });

  it("saves a profile edit once and keeps completion intact", async () => {
    const user = userEvent.setup();
    const view = renderProfile();
    const name = screen.getByRole("textbox", {
      name: "What should we call you?",
    });
    await user.clear(name);
    await user.type(name, "Updated Name");

    let finish!: () => void;
    hooks.save.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const save = screen.getByRole("button", { name: "Save profile" });
    await user.click(save);
    expect(save).toBeDisabled();
    await user.click(save);
    expect(hooks.save).toHaveBeenCalledOnce();
    expect(hooks.save.mock.calls[0][0]).toMatchObject({
      complete: true,
      onboardingStep: 4,
      values: { preferredDisplayName: "Updated Name" },
    });

    await act(async () => finish());
    view.rerender(
      <ProfileOverview
        data={{
          ...completedProfile(),
          profile: {
            ...completedProfile().profile!,
            preferredDisplayName: "Updated Name",
            updatedAt: 20,
          },
        }}
        activeSection="professional"
      />,
    );
    await waitFor(() =>
      expect(screen.getByDisplayValue("Updated Name")).toBeInTheDocument(),
    );
  });
});
