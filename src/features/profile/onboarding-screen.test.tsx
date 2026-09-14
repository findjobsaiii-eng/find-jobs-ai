import { fireEvent, render, screen } from "@testing-library/react";
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
      : [],
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
      screen.getByRole("textbox", { name: "What should we call you?" }),
    ).toHaveValue("Google Candidate");
  });

  it("shows field validation and does not submit an incomplete step", async () => {
    const user = userEvent.setup();
    render(<OnboardingScreen initialData={emptyProfile} />);

    await user.clear(
      screen.getByRole("textbox", { name: "What should we call you?" }),
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
      screen.getByRole("combobox", {
        name: "Which roles would you like to work in?",
      }),
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

  it("uses a compact experience stepper and leaves the summary optional", async () => {
    const user = userEvent.setup();
    const resumed = {
      ...emptyProfile,
      profile: {
        _id: "candidateProfiles:profile-1",
        _creationTime: 1,
        userId: "users:user-1",
        email: "candidate@example.com",
        preferredDisplayName: "Candidate",
        targetJobTitleIds: ["catalogItems:title-1"],
        onboardingStep: 2,
        onboardingCompleted: false,
        createdAt: 1,
        updatedAt: 2,
      },
      selections: {
        targetJobTitles: [
          {
            id: "catalogItems:title-1",
            labelEn: "Frontend Engineer",
            labelHe: "מפתח Frontend",
            isCustom: false,
          },
        ],
        skills: [],
      },
    } as unknown as CurrentProfile;

    render(<OnboardingScreen initialData={resumed} />);

    const experience = screen.getByRole("spinbutton", {
      name: "How many years of experience do you have?",
    });
    expect(experience).toHaveValue(0);

    await user.click(
      screen.getByRole("button", { name: "Increase years of experience" }),
    );
    expect(experience).toHaveValue(1);
    await user.click(
      screen.getByRole("button", { name: "Decrease years of experience" }),
    );
    expect(experience).toHaveValue(0);

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.queryByText(
        "Keep your professional introduction under 1,200 characters.",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Add at least one skill (up to 30)."),
    ).toBeVisible();
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
      screen.getByRole("heading", {
        name: "What does the right job look like?",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Step 3 of 4")).toBeInTheDocument();
  });

  it("uses an accessible radius slider and formats salary in the Hebrew RTL location step", async () => {
    const user = userEvent.setup();
    await i18n.changeLanguage("he");
    const resumed = {
      ...emptyProfile,
      profile: {
        _id: "candidateProfiles:profile-1",
        _creationTime: 1,
        userId: "users:user-1",
        email: "candidate@example.com",
        preferredPlaceIds: ["place-rishon"],
        locationRadiusKm: 25,
        onboardingStep: 3,
        onboardingCompleted: false,
        createdAt: 1,
        updatedAt: 2,
      },
      selections: { targetJobTitles: [], skills: [] },
    } as unknown as CurrentProfile;

    render(<OnboardingScreen initialData={resumed} />);

    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    const radius = screen.getByRole("slider", {
      name: "כמה רחוק תהיה מוכן לנסוע?",
    });
    radius.focus();
    fireEvent.change(radius, { target: { value: "40" } });

    expect(radius).toHaveValue("40");
    expect(
      screen.getByText("נחפש משרות עד 40 ק״מ ממיקום שמור."),
    ).toBeInTheDocument();

    const salary = screen.getByRole("textbox", {
      name: "מה השכר החודשי המינימלי שמתאים לך?",
    });
    await user.type(salary, "4000");
    expect(salary).toHaveValue("4,000");
  });
});
