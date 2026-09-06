import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import i18n, { initializeI18n } from "@/i18n";
import { ProfileGate } from "@/features/profile/profile-gate";
import type { CurrentProfile } from "@/features/profile/profile-types";
import type { FunctionArgs } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import { getProfileCompletion } from "./dashboard-model";

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

describe("dashboard and completed profile editing", () => {
  beforeAll(async () => {
    await initializeI18n();
  });
  beforeEach(async () => {
    hooks.data = completedProfile();
    hooks.save.mockReset();
    await i18n.changeLanguage("en");
  });

  it("routes completed profiles to the dashboard and opens the prefilled editor in RTL", async () => {
    await i18n.changeLanguage("he");
    const user = userEvent.setup();
    const view = render(<ProfileGate />);
    expect(
      screen.getByRole("heading", { name: "בוקר טוב, Matan" }),
    ).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    await user.click(
      screen.getAllByRole("button", { name: "עריכת פרופיל" })[0],
    );
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
      screen.queryByRole("heading", { name: "בוקר טוב, Matan" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "שמירת טיוטה" }),
    ).toBeInTheDocument();
  });

  it("saves prefilled edits once with completion intact and returns to updated dashboard", async () => {
    const user = userEvent.setup();
    const view = render(<ProfileGate />);
    await user.click(
      screen.getAllByRole("button", { name: "Edit profile" })[0],
    );
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
        screen.getByRole("heading", { name: "Good morning, Updated Name" }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText("Your profile and preferences are up to date."),
    ).toBeInTheDocument();
  });

  it("calculates completion from saved values, including zero years and missing fields", () => {
    const data = completedProfile();
    expect(getProfileCompletion(data)).toEqual({
      percentage: 100,
      nextField: null,
    });
    const missing = {
      ...data,
      profile: {
        ...data.profile!,
        professionalSummary: undefined,
        locationRadiusKm: undefined,
      },
    };
    expect(getProfileCompletion(missing)).toEqual({
      percentage: 82,
      nextField: "onboarding.fields.summary",
    });
    expect(
      getProfileCompletion({
        ...data,
        profile: null,
        selections: { targetJobTitles: [], skills: [] },
      }).percentage,
    ).toBe(0);
  });
});
