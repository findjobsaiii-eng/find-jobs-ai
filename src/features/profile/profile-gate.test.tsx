import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeI18n } from "@/i18n";
import { ProfileGate } from "./profile-gate";
import type { CurrentProfile } from "./profile-types";

const state = vi.hoisted(() => ({
  profile: null as unknown,
  resume: null as unknown,
}));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (reference: never) =>
      getFunctionName(reference) === "candidateProfiles:getCurrent"
        ? state.profile
        : state.resume,
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
});
