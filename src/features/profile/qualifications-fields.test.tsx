import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n, { initializeI18n } from "@/i18n";
import type { CandidateQualifications } from "../../../convex/candidateQualifications";
import { QualificationsFields } from "./qualifications-fields";

vi.mock("convex/react", () => ({ useQuery: () => [] }));

function Editor() {
  const [value, setValue] = useState<CandidateQualifications>({
    academicDegreeStatus: "none",
    education: [],
  });
  return <QualificationsFields value={value} onChange={setValue} />;
}

beforeEach(async () => {
  await initializeI18n();
  await i18n.changeLanguage("en");
});

describe("education editing", () => {
  it.each([
    ["en", "Bachelor of Computer Science "],
    ["he", "תואר ראשון במדעי המחשב "],
  ])("preserves spaces while typing a name in %s", async (language, name) => {
    await i18n.changeLanguage(language);
    const user = userEvent.setup();
    render(<Editor />);
    await user.click(
      screen.getByRole("button", { name: i18n.t("qualifications.add") }),
    );
    const input = screen.getByRole("combobox", {
      name: i18n.t("qualifications.credential"),
    });
    await user.type(input, name);
    expect(input).toHaveValue(name);
  });

  it("defaults new entries to Completed and allows switching to Studying", () => {
    render(<Editor />);
    expect(
      screen.queryByLabelText("Qualification type"),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Add education or qualification" }),
    );
    expect(screen.getByRole("radio", { name: "Studying" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Completed" })).toBeChecked();
    fireEvent.change(screen.getByLabelText("Qualification type"), {
      target: { value: "bachelor" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Completed" }));
    expect(screen.getByRole("radio", { name: "Completed" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "Studying" }));
    expect(screen.getByRole("radio", { name: "Studying" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Completed" })).not.toBeChecked();
    fireEvent.change(screen.getByLabelText("Degree or qualification name"), {
      target: { value: "Computer Science" },
    });
    expect(screen.getByLabelText("Degree or qualification name")).toHaveValue(
      "Computer Science",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Remove qualification 1" }),
    );
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("keeps a CV study field in the single name and clears old field metadata when edited", () => {
    const onChange = vi.fn();
    render(
      <QualificationsFields
        value={{
          academicDegreeStatus: "completed",
          education: [
            {
              level: "bachelor",
              status: "completed",
              field: "Computer Science",
              credential: "B.Sc.",
            },
          ],
        }}
        onChange={onChange}
      />,
    );
    expect(screen.getByLabelText("Degree or qualification name")).toHaveValue(
      "B.Sc. · Computer Science",
    );
    expect(screen.queryByLabelText("Field of study")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Degree or qualification name"), {
      target: { value: "Accounting" },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        education: [
          expect.objectContaining({
            credential: "Accounting",
            field: null,
            status: "completed",
          }),
        ],
      }),
    );
  });

  it("shows CV education immediately and lets the user correct it in Hebrew", async () => {
    await i18n.changeLanguage("he");
    function CvEditor() {
      const [value, setValue] = useState<CandidateQualifications>({
        academicDegreeStatus: "none",
        education: [
          {
            level: "bachelor",
            status: "in_progress",
            field: "tech",
            credential: "מדמח",
          },
        ],
      });
      return <QualificationsFields value={value} onChange={setValue} />;
    }
    render(<CvEditor />);
    expect(screen.getByLabelText("שם התואר או ההסמכה")).toHaveValue("מדמח");
    expect(screen.getByRole("radio", { name: "בלימודים" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "הושלם" }));
    expect(screen.getByRole("radio", { name: "הושלם" })).toBeChecked();
    expect(screen.queryByText("לא אושר")).not.toBeInTheDocument();
  });
});
