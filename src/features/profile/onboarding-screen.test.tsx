import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import i18n, { initializeI18n } from "@/i18n";
import { OnboardingScreen } from "./onboarding-screen";
import type { CurrentProfile } from "./profile-types";

const hooks = vi.hoisted(() => ({
  saveProfile: vi.fn<
    (args: {
      onboardingStep: number;
      complete: boolean;
      values: {
        preferredDisplayName?: string | null;
        targetJobTitleIds?: string[];
      };
    }) => Promise<unknown>
  >(),
  signOut: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useMutation: () => hooks.saveProfile,
  useQuery: (_reference: unknown, args: { kind?: string }) =>
    args.kind === "jobTitle"
      ? [
          {
            id: "catalogItems:title-1",
            labelEn: "Frontend Engineer",
            labelHe: "מפתח Frontend",
            isCustom: false,
          },
        ]
      : args.kind === "skill"
        ? []
        : [
            {
              code: "locality:5000",
              nameEn: "Tel Aviv - Yafo",
              nameHe: "תל אביב - יפו",
              kind: "locality",
            },
          ],
}));

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signOut: hooks.signOut }),
}));

vi.mock("@googlemaps/js-api-loader", () => ({
  setOptions: vi.fn(),
  importLibrary: vi.fn(() => new Promise(() => undefined)),
}));

const emptyProfile = {
  identity: {
    userId: "users:user-1",
    email: "candidate@example.com",
    googleDisplayName: "Google Candidate",
    profileImage: null,
  },
  profile: null,
  selections: {
    targetJobTitles: [],
    skills: [],
  },
} as unknown as CurrentProfile;

describe("candidate profile onboarding", () => {
  beforeAll(async () => {
    await initializeI18n();
  });

  beforeEach(async () => {
    hooks.saveProfile.mockReset();
    hooks.signOut.mockReset();
    await i18n.changeLanguage("en");
  });

  it("shows server-derived Google identity without an editable email field", () => {
    render(<OnboardingScreen initialData={emptyProfile} />);

    expect(screen.getByText("candidate@example.com")).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: /email/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Preferred display name" }),
    ).toHaveValue("Google Candidate");
  });

  it("shows field validation and does not submit an incomplete step", async () => {
    const user = userEvent.setup();
    render(<OnboardingScreen initialData={emptyProfile} />);

    await user.clear(
      screen.getByRole("textbox", { name: "Preferred display name" }),
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      screen.getByText("Enter a display name between 2 and 80 characters."),
    ).toBeVisible();
    expect(
      screen.getByText("Add between 1 and 5 target job titles."),
    ).toBeVisible();
    expect(hooks.saveProfile).not.toHaveBeenCalled();
  });

  it("saves progress before advancing and blocks duplicate submissions", async () => {
    const user = userEvent.setup();
    hooks.saveProfile.mockReturnValue(new Promise(() => undefined));
    render(<OnboardingScreen initialData={emptyProfile} />);

    await user.click(
      screen.getByRole("combobox", { name: "Target job titles" }),
    );
    await user.click(screen.getByRole("option", { name: "Frontend Engineer" }));
    await user.keyboard("{Escape}");
    const continueButton = screen.getByRole("button", { name: "Continue" });
    await user.click(continueButton);

    expect(hooks.saveProfile).toHaveBeenCalledTimes(1);
    const saveArgs = hooks.saveProfile.mock.calls[0]?.[0];
    expect(saveArgs?.onboardingStep).toBe(2);
    expect(saveArgs?.complete).toBe(false);
    expect(saveArgs?.values.preferredDisplayName).toBe("Google Candidate");
    expect(saveArgs?.values.targetJobTitleIds).toEqual([
      "catalogItems:title-1",
    ]);
    expect(continueButton).toBeDisabled();
    await user.click(continueButton);
    expect(hooks.saveProfile).toHaveBeenCalledTimes(1);
  });

  it("resumes at the last saved step", () => {
    const resumed = {
      ...emptyProfile,
      profile: {
        _id: "candidateProfiles:profile-1",
        _creationTime: 1,
        userId: "users:user-1",
        email: "candidate@example.com",
        preferredDisplayName: "Candidate",
        targetJobTitleIds: [],
        professionalSummary:
          "Experienced engineer focused on reliable and accessible product experiences.",
        yearsOfExperience: 5,
        skillIds: [],
        preferredPlaceIds: [],
        locationRadiusKm: 25,
        workArrangements: [],
        employmentTypes: [],
        languages: [],
        onboardingStep: 3,
        onboardingCompleted: false,
        createdAt: 1,
        updatedAt: 2,
      },
      selections: {
        targetJobTitles: [],
        skills: [],
      },
    } as unknown as CurrentProfile;

    render(<OnboardingScreen initialData={resumed} />);
    expect(
      screen.getByRole("heading", { name: "Define your ideal role" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Step 3 of 4")).toBeInTheDocument();
  });
});
