import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
import i18n, { initializeI18n } from "@/i18n";
import { EducationNameInput } from "./education-name-input";
const state = vi.hoisted(() => ({
  results: [
    {
      id: "education:cs",
      kind: "field",
      labelEn: "Computer Science",
      labelHe: "מדעי המחשב",
    },
  ],
}));
vi.mock("convex/react", () => ({ useQuery: () => state.results }));
function Editor() {
  const [value, setValue] = useState("");
  return (
    <>
      <EducationNameInput value={value} onChange={setValue} />
      <button>Save</button>
    </>
  );
}
describe("searchable education name", () => {
  beforeAll(async () => {
    await initializeI18n();
  });
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });
  it.each(["en", "he"])(
    "selects a database suggestion using keyboard in %s",
    async (language) => {
      await i18n.changeLanguage(language);
      const user = userEvent.setup();
      render(<Editor />);
      const input = screen.getByRole("combobox", {
        name: i18n.t("qualifications.credential"),
      });
      await user.click(input);
      await user.keyboard("{ArrowDown}{Enter}");
      expect(input).toHaveValue(
        language === "he" ? "מדעי המחשב" : "Computer Science",
      );
    },
  );
  it("accepts a free-form name with spaces and preserves it on blur", async () => {
    const user = userEvent.setup();
    render(<Editor />);
    const input = screen.getByRole("combobox");
    const save = screen.getByRole("button", { name: "Save" });
    await user.type(input, "Bachelor of Meteorology ");
    await user.click(save);
    expect(input).toHaveValue("Bachelor of Meteorology ");
  });
  it("offers an explicit add-your-own option without forcing an existing subject", async () => {
    const user = userEvent.setup();
    render(<Editor />);
    const input = screen.getByRole("combobox");
    await user.type(input, "Astronomy");
    await user.click(screen.getByRole("option", { name: /Astronomy/ }));
    expect(input).toHaveValue("Astronomy");
  });
});
