import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import i18n, { initializeI18n } from "@/i18n";
import { ProfileGate } from "@/features/profile/profile-gate";
import type { CurrentProfile } from "@/features/profile/profile-types";
import type { FunctionArgs } from "convex/server";
import type { api } from "../../../convex/_generated/api";

const hooks = vi.hoisted(() => ({
  data: null as CurrentProfile | null,
  save: vi.fn<
    (
      args: FunctionArgs<typeof api.candidateProfiles.saveCurrent>,
    ) => Promise<void>
  >(),
}));
vi.mock("convex/react", () => ({
  useQuery: (_ref: unknown, args?: { kind?: string }) =>
    args?.kind ? [] : args ? { jobs: [] } : hooks.data,
  useMutation: () => hooks.save,
  useAction: () => vi.fn(),
}));
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

async function openProfile(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "User menu" }));
  await user.click(screen.getByRole("link", { name: "Profile" }));
}

describe("dashboard and completed profile editing", () => {
  beforeAll(async () => {
    await initializeI18n();
  });
  beforeEach(async () => {
    window.history.replaceState(null, "", "/");
    hooks.data = completedProfile();
    hooks.save.mockReset();
    await i18n.changeLanguage("en");
  });

  it("routes completed profiles to the dashboard and opens the prefilled editor in RTL", async () => {
    await i18n.changeLanguage("he");
    const user = userEvent.setup();
    const view = render(<ProfileGate />);
    expect(
      screen.getByRole("heading", { name: "משרות מומלצות עבורך" }),
    ).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    await user.click(screen.getByRole("button", { name: "תפריט משתמש" }));
    await user.click(screen.getByRole("link", { name: "פרופיל" }));
    await user.click(screen.getByRole("button", { name: "עריכת פרופיל" }));
    expect(window.location.pathname).toBe("/profile");
    expect(screen.queryByText(/שלב 1 מתוך 4/)).not.toBeInTheDocument();
    expect(await screen.findByDisplayValue("Matan")).toBeInTheDocument();
    expect(screen.getByText("candidate@example.com")).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: /email/i }),
    ).not.toBeInTheDocument();
    expect(hooks.save).not.toHaveBeenCalled();
    view.unmount();
    hooks.data = { ...completedProfile(), profile: null };
    render(<ProfileGate />);
    expect(
      screen.queryByRole("heading", { name: "משרות מומלצות עבורך" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "גרור קורות חיים לכאן או לחץ לבחירת קובץ",
      }),
    ).toBeInTheDocument();
  });

  it("restores URL tabs with history and remounting, and returns from profile", async () => {
    window.history.replaceState(null, "", "/?tab=in-progress");
    const user = userEvent.setup();
    const view = render(<ProfileGate />);
    const savedLink = () => screen.getByRole("link", { name: "Saved" });
    expect(savedLink()).toHaveAttribute("aria-current", "page");
    await user.click(screen.getByRole("link", { name: "Suggestions" }));
    expect(window.location.search).toBe("");
    act(() => window.history.back());
    await waitFor(() =>
      expect(savedLink()).toHaveAttribute("aria-current", "page"),
    );
    act(() => window.history.forward());
    await waitFor(() =>
      expect(savedLink()).not.toHaveAttribute("aria-current"),
    );
    await user.click(savedLink());
    view.unmount();
    render(<ProfileGate />);
    expect(savedLink()).toHaveAttribute("aria-current", "page");
    await openProfile(user);
    await user.click(screen.getByRole("button", { name: "Edit profile" }));
    expect(window.location.pathname).toBe("/profile");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(window.location.pathname).toBe("/profile");
    expect(window.location.search).toBe("?tab=in-progress");
  });

  it("opens direct profile links and falls back for unknown URLs", async () => {
    window.history.replaceState(null, "", "/profile");
    const view = render(<ProfileGate />);
    expect(
      await screen.findByRole("heading", { name: "Professional profile" }),
    ).toBeInTheDocument();
    view.unmount();
    window.history.replaceState(null, "", "/missing");
    const fallback = render(<ProfileGate />);
    await waitFor(() => expect(window.location.pathname).toBe("/"));
    fallback.unmount();
    window.history.replaceState(null, "", "/?tab=invalid");
    render(<ProfileGate />);
    expect(screen.getByRole("link", { name: "Suggestions" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("saves prefilled edits once with completion intact on the profile page", async () => {
    const user = userEvent.setup();
    const view = render(<ProfileGate />);
    await openProfile(user);
    await user.click(screen.getByRole("button", { name: "Edit profile" }));
    expect(window.location.pathname).toBe("/profile");
    const name = await screen.findByRole("textbox", {
      name: "Preferred display name",
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
      values: {
        preferredDisplayName: "Updated Name",
        locationRadiusKm: 40,
        preferredPlaceIds: ["place-one"],
      },
    });
    expect(hooks.save.mock.calls[0][0].values).not.toHaveProperty("email");
    expect(hooks.save.mock.calls[0][0].values).not.toHaveProperty("userId");
    hooks.data = {
      ...completedProfile(),
      profile: {
        ...completedProfile().profile!,
        preferredDisplayName: "Updated Name",
        updatedAt: 20,
      },
    };
    await act(async () => {
      finish();
    });
    view.rerender(<ProfileGate />);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Professional profile" }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("Updated Name")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/profile");
  });

  it("redirects the legacy edit URL to the profile page", async () => {
    window.history.replaceState(null, "", "/profile/edit");
    render(<ProfileGate />);
    await waitFor(() => expect(window.location.pathname).toBe("/profile"));
    expect(
      screen.getByRole("heading", { name: "Professional profile" }),
    ).toBeInTheDocument();
  });

  it("supports keyboard navigation and language switching in the shared shell", async () => {
    const user = userEvent.setup();
    render(<ProfileGate />);
    const trigger = screen.getByRole("button", { name: "User menu" });
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("link", { name: "Profile" })).toBeVisible();
    await user.click(await screen.findByRole("button", { name: "עברית" }));
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    expect(
      screen.queryByRole("button", { name: "כלי פיתוח" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "הצעות" })).toBeInTheDocument();
  });
});
