import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import i18n, { initializeI18n } from "@/i18n";
import { ResumeLibrary } from "./resume-library";

const hooks = vi.hoisted(() => ({
  mutation: vi.fn(),
  processResume: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: () => [],
  useMutation: () => hooks.mutation,
  useAction: () => hooks.processResume,
}));

describe("resume library uploads", () => {
  beforeAll(async () => {
    await initializeI18n();
  });

  beforeEach(async () => {
    await i18n.changeLanguage("en");
    hooks.mutation.mockReset().mockImplementation(async (args: unknown) => {
      if (args && Object.keys(args).length === 0) {
        return "https://uploads.example.test/resume";
      }
      return "resumeDocuments:resume-1";
    });
    hooks.processResume.mockReset().mockResolvedValue(null);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ storageId: "storage:resume-1" }),
      }),
    );
  });

  it("keeps optional metadata hidden until a file is selected", async () => {
    const user = userEvent.setup();
    const { container } = render(<ResumeLibrary />);

    expect(
      screen.queryByRole("textbox", { name: "Short label (optional)" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Note (optional)" }),
    ).not.toBeInTheDocument();

    const fileInput =
      container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    const file = new File(["resume"], "product-resume.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(fileInput!, { target: { files: [file] } });

    expect(
      screen.getByRole("heading", { name: "Add resume details" }),
    ).toBeVisible();
    expect(screen.getByText("product-resume.pdf")).toBeVisible();

    await user.type(
      screen.getByRole("textbox", { name: "Short label (optional)" }),
      "Product CV",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Note (optional)" }),
      "Tailored for product roles",
    );
    await user.click(screen.getByRole("button", { name: "Upload resume" }));

    await waitFor(() => {
      expect(hooks.processResume).toHaveBeenCalledWith({
        resumeId: "resumeDocuments:resume-1",
      });
    });
    expect(hooks.mutation).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: "product-resume.pdf",
        displayName: "Product CV",
        note: "Tailored for product roles",
      }),
    );
  });
});
