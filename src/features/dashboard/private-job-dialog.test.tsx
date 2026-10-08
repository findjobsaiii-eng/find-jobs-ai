import { DirectionProvider } from "@base-ui/react/direction-provider";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexError } from "convex/values";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import i18n, { initializeI18n } from "@/i18n";
import { PrivateJobDialog } from "./private-job-dialog";

const hooks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useMutation: (reference: unknown) =>
      getFunctionName(reference as never) === "privateJobs:create"
        ? hooks.create
        : hooks.update,
  };
});

describe("private job creation", () => {
  beforeAll(async () => {
    await initializeI18n();
  });
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    hooks.create.mockReset().mockResolvedValue("privateJobs:one");
    hooks.update.mockReset();
  });

  it("requires title and company and saves an offline job with Saved status using the keyboard", async () => {
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(
      <DirectionProvider direction="ltr">
        <PrivateJobDialog onSaved={onSaved} onClose={vi.fn()} />
      </DirectionProvider>,
    );
    const title = screen.getByRole("textbox", { name: "Job title" });
    await waitFor(() => expect(title).toHaveFocus());
    expect(screen.getByRole("button", { name: "Add job" })).toBeDisabled();
    await user.type(title, "Engineer");
    await user.tab();
    expect(screen.getByRole("textbox", { name: "Company" })).toHaveFocus();
    await user.keyboard("Acme{Enter}");
    expect(hooks.create).toHaveBeenCalledExactlyOnceWith({
      title: "Engineer",
      companyName: "Acme",
      sourceUrl: "",
      locationText: "",
      descriptionText: "",
      status: "saved",
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(hooks.update).not.toHaveBeenCalled();
  });

  it("preserves the draft after an invalid link and prevents duplicate submissions while saving", async () => {
    hooks.create.mockRejectedValueOnce(
      new ConvexError({ code: "INVALID_JOB_URL" }),
    );
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<PrivateJobDialog onSaved={onSaved} onClose={vi.fn()} />);
    await user.type(
      screen.getByRole("textbox", { name: "Job title" }),
      "Engineer",
    );
    await user.type(screen.getByRole("textbox", { name: "Company" }), "Acme");
    await user.type(
      screen.getByRole("textbox", { name: "Job link (optional)" }),
      "https://example.com",
    );
    await user.click(screen.getByRole("button", { name: "Add job" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter a valid http:// or https:// link.",
    );
    expect(screen.getByRole("textbox", { name: "Job title" })).toHaveValue(
      "Engineer",
    );
    let resolve!: (value: string) => void;
    hooks.create.mockImplementationOnce(
      () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    );
    await user.click(screen.getByRole("button", { name: "Add job" }));
    expect(screen.getByRole("button", { name: "Add job" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Job title" })).toBeDisabled();
    resolve("privateJobs:one");
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(hooks.create).toHaveBeenCalledTimes(2);
  });
});
