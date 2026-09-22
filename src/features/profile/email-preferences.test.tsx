import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import i18n, { initializeI18n } from "@/i18n";
import { EmailPreferences } from "./email-preferences";

const hooks = vi.hoisted(() => ({ updateFrequency: vi.fn() }));

vi.mock("convex/react", () => ({
  useQuery: () => ({ frequency: "daily" }),
  useMutation: () => hooks.updateFrequency,
}));

describe("email preferences", () => {
  beforeAll(async () => {
    await initializeI18n();
  });

  beforeEach(async () => {
    await i18n.changeLanguage("he");
    hooks.updateFrequency.mockReset().mockResolvedValue({
      frequency: "never",
    });
  });

  it("shows the daily default and lets the user stop job emails", async () => {
    const user = userEvent.setup();
    render(<EmailPreferences />);

    expect(screen.getByRole("radio", { name: /יומי/ })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: /לעולם לא/ }));

    expect(hooks.updateFrequency).toHaveBeenCalledWith({ frequency: "never" });
    expect(await screen.findByText("העדפת האימייל נשמרה.")).toBeVisible();
  });
});
