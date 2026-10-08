import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeI18n } from "@/i18n";
import { ProfileGate } from "./profile-gate";
import type { CurrentProfile } from "./profile-types";

const state = vi.hoisted(() => ({
  profile: null as unknown,
  resume: null as unknown,
  error: null as Error | null,
  reload: vi.fn(),
  capture: vi.fn(),
}));
vi.mock("@/lib/sentry-errors", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sentry-errors")>();
  return {
    ...actual,
    captureBoundaryError: state.capture,
    recoverBoundaryError: (error: Error, retry: () => void) =>
      actual.recoverBoundaryError(error, retry, state.reload),
  };
});
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (reference: never, args: unknown) => {
      if (state.error) throw state.error;
      return getFunctionName(reference) === "candidateProfiles:getCurrent"
        ? state.profile
        : args === "skip"
          ? undefined
          : state.resume;
    },
  };
});
vi.mock("./resume-onboarding", () => ({
  ResumeOnboarding: ({ onManualEntry }: { onManualEntry: () => void }) => (
    <button onClick={onManualEntry}>Manual entry</button>
  ),
}));
vi.mock("./onboarding-screen", () => ({
  OnboardingScreen: ({ initialData }: { initialData: CurrentProfile }) => {
    const [name, setName] = useState(
      initialData.profile?.qualifications?.education[0]?.credential ?? "",
    );
    return (
      <input
        aria-label="Education draft"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
    );
  },
}));
const initialData = {
  identity: {
    userId: "users:test",
    email: "candidate@example.com",
    googleDisplayName: "Candidate",
    profileImage: null,
  },
  profile: { onboardingCompleted: false, profileSourceVersion: 0 },
  selections: { targetJobTitles: [], skills: [] },
} as unknown as CurrentProfile;

function content() {
  return (
    <ProfileGate loading={<p>Loading</p>}>{() => <p>Dashboard</p>}</ProfileGate>
  );
}

describe("onboarding draft source", () => {
  beforeAll(async () => {
    await initializeI18n();
  });
  beforeEach(() => {
    state.profile = initialData;
    state.resume = null;
    state.error = null;
    state.reload.mockClear();
    state.capture.mockClear();
  });
  it("opens a completed profile without depending on the deleted resume query", () => {
    state.profile = {
      ...initialData,
      profile: { ...initialData.profile, onboardingCompleted: true },
    };
    state.resume = undefined;
    render(content());
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });
  it("prefills fresh CV education after moving from a manual draft to resume review", () => {
    const view = render(content());
    fireEvent.click(screen.getByRole("button", { name: "Manual entry" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Old draft" },
    });
    state.resume = { id: "resumeDocuments:new", status: "ready" };
    state.profile = {
      ...initialData,
      profile: {
        ...initialData.profile,
        activeResumeId: "resumeDocuments:new",
        profileSourceVersion: 1,
        qualifications: {
          academicDegreeStatus: "none",
          education: [
            {
              credential: "Software Engineering",
              field: null,
              status: "in_progress",
              level: "diploma",
            },
          ],
        },
      },
    };
    view.rerender(content());
    expect(
      screen.getByRole("textbox", { name: "Education draft" }),
    ).toHaveValue("Software Engineering");
  });
  it("preserves unsaved edits through ordinary reactive profile updates", () => {
    const view = render(content());
    fireEvent.click(screen.getByRole("button", { name: "Manual entry" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "My correction" },
    });
    state.profile = {
      ...initialData,
      profile: { ...initialData.profile, onboardingStep: 2, updatedAt: 123 },
    };
    view.rerender(content());
    expect(screen.getByRole("textbox")).toHaveValue("My correction");
  });
  it.each([
    new DOMException(
      "Failed to execute 'insertBefore' on 'Node': The reference is not a child.",
      "NotFoundError",
    ),
    Object.assign(new Error("Loading chunk 12 failed"), {
      name: "ChunkLoadError",
    }),
  ])(
    "reloads the document only after Retry for a broken DOM or chunk (%s)",
    (error) => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      try {
        state.error = error;
        render(content());
        expect(state.capture).toHaveBeenCalledWith(error, "profile");
        expect(state.reload).not.toHaveBeenCalled();
        state.error = null;
        fireEvent.click(
          screen.getByRole("button", { name: /ניסיון נוסף|Try again/iu }),
        );
        expect(state.reload).toHaveBeenCalledOnce();
        expect(screen.queryByText("Manual entry")).not.toBeInTheDocument();
      } finally {
        consoleError.mockRestore();
      }
    },
  );
  it("retries an ordinary profile query without reloading the document", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    try {
      state.error = new Error(
        "[CONVEX Q(candidateProfiles:getCurrent)] Server Error",
      );
      render(content());
      state.error = null;
      fireEvent.click(
        screen.getByRole("button", { name: /ניסיון נוסף|Try again/iu }),
      );
      expect(screen.getByText("Manual entry")).toBeInTheDocument();
      expect(state.reload).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});
