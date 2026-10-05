import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import i18n, { initializeI18n } from "@/i18n";
import type { CurrentProfile } from "./profile-types";
import type { Id } from "../../../convex/_generated/dataModel";
import { ResumeProfileUpdateDialog } from "./resume-profile-update-dialog";
const hooks = vi.hoisted(() => ({
  save: vi.fn(),
  data: null as CurrentProfile | null,
}));
vi.mock("convex/react", () => ({
  useMutation: () => hooks.save,
  useQuery: (_ref: unknown, args: { resumeId?: string }) =>
    args.resumeId ? hooks.data : [],
}));
vi.mock("@googlemaps/js-api-loader", () => ({
  setOptions: vi.fn(),
  importLibrary: vi.fn(() => new Promise(() => undefined)),
}));
const resumeId = "resumeDocuments:new" as Id<"resumeDocuments">;
const title = {
  id: "catalogItems:title" as Id<"catalogItems">,
  labelEn: "Frontend Engineer",
  labelHe: "מפתח Frontend",
  isCustom: false,
};
const skill = {
  ...title,
  id: "catalogItems:skill" as Id<"catalogItems">,
  labelEn: "React",
  labelHe: "React",
};
beforeAll(initializeI18n);
beforeEach(async () => {
  await i18n.changeLanguage("en");
  hooks.save.mockReset().mockResolvedValue(null);
  hooks.data = {
    identity: {
      userId: "users:owner" as Id<"users">,
      email: "owner@example.com",
      googleDisplayName: "Owner",
      profileImage: null,
    },
    selections: { targetJobTitles: [title], skills: [skill] },
    profile: {
      _id: "candidateProfiles:owner" as Id<"candidateProfiles">,
      _creationTime: 1,
      userId: "users:owner" as Id<"users">,
      email: "owner@example.com",
      preferredDisplayName: "Extracted name",
      targetJobTitleIds: [title.id],
      skillIds: [skill.id],
      yearsOfExperience: 4,
      professionalSummary: "Factual extracted summary",
      qualifications: { academicDegreeStatus: "none", education: [] },
      preferredPlaceIds: ["tel-aviv"],
      locationRadiusKm: 25,
      primaryLocation: {
        placeId: "tel-aviv",
        formattedAddress: "Tel Aviv, Israel",
        city: "Tel Aviv",
        country: "Israel",
        countryCode: "IL",
        latitude: 32,
        longitude: 34,
        radiusKm: 25,
      },
      workArrangements: ["remote"],
      employmentTypes: ["full-time"],
      languages: [{ languageCode: "en", proficiency: "fluent" }],
      onboardingStep: 4,
      onboardingCompleted: true,
      createdAt: 1,
      updatedAt: 123,
    },
  };
});
it("keeps edits local across review steps and saves only after explicit approval", async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(<ResumeProfileUpdateDialog resumeId={resumeId} onClose={onClose} />);
  const name = screen.getByDisplayValue("Extracted name");
  await user.clear(name);
  await user.type(name, "My approved name");
  for (let step = 1; step <= 3; step++) {
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(hooks.save).not.toHaveBeenCalled();
  }
  await user.click(
    screen.getByRole("button", { name: "Approve profile update" }),
  );
  await waitFor(() => expect(hooks.save).toHaveBeenCalledOnce());
  expect(hooks.save).toHaveBeenCalledWith(
    expect.objectContaining({
      complete: true,
      resumeUpdate: { resumeId, expectedUpdatedAt: 123 },
      values: expect.objectContaining({
        preferredDisplayName: "My approved name",
      }),
    }),
  );
  expect(onClose).toHaveBeenCalledOnce();
});
it("cancels a Hebrew review without saving profile changes", async () => {
  await i18n.changeLanguage("he");
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(<ResumeProfileUpdateDialog resumeId={resumeId} onClose={onClose} />);
  expect(screen.getByRole("dialog")).toHaveAttribute("dir", "rtl");
  await user.clear(screen.getByDisplayValue("Extracted name"));
  await user.click(
    screen.getByRole("button", { name: i18n.t("common.cancel") }),
  );
  expect(onClose).toHaveBeenCalledOnce();
  expect(hooks.save).not.toHaveBeenCalled();
});
