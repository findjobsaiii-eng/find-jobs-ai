import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import i18n, { initializeI18n } from "@/i18n";
import { StepFour } from "./onboarding-screen";
import type { ProfileDraft } from "./profile-types";

function LanguageHarness() {
  const [draft, setDraft] = useState(
    () =>
      ({
        languages: [{ languageCode: "en", proficiency: "fluent" }],
      }) as ProfileDraft,
  );
  return (
    <StepFour draft={draft} setDraft={setDraft} errors={{}} showReady={false} />
  );
}

describe("profile language section", () => {
  beforeAll(async () => {
    await initializeI18n();
  });

  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("opens a styled language menu instead of a native add-language select", async () => {
    const user = userEvent.setup();
    render(<LanguageHarness />);

    const addLanguage = screen.getByRole("button", {
      name: "Add another language",
    });
    expect(addLanguage).toBeVisible();
    expect(
      screen.queryByRole("combobox", { name: "Add another language" }),
    ).not.toBeInTheDocument();

    await user.click(addLanguage);
    await user.click(screen.getByRole("button", { name: /Arabic/ }));

    expect(screen.getByText("Arabic")).toBeVisible();
    expect(screen.getByRole("button", { name: "Remove Arabic" })).toBeVisible();
  });
});
