import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ConvexError } from "convex/values";
import i18n, { initializeI18n } from "@/i18n";
import { ResumeOnboarding } from "./resume-onboarding";
import { processingErrorKey } from "./resume-errors";

const hooks = vi.hoisted(() => ({
  generate: vi.fn(),
  create: vi.fn(),
  finish: vi.fn(),
  process: vi.fn(),
  catalogMutation: vi.fn(),
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: () => [],
    useAction: () => hooks.process,
    useMutation: (reference: unknown) => {
      const name = getFunctionName(reference as never);
      if (name === "resumes:generateUploadUrl") return hooks.generate;
      if (name === "resumes:createFromUpload") return hooks.create;
      if (name === "resumes:finishReview") return hooks.finish;
      return hooks.catalogMutation;
    },
  };
});
vi.mock("@/lib/google-maps", () => ({
  hasGoogleMapsApiKey: () => false,
  loadGooglePlaces: vi.fn(),
}));

const readyResume = {
  id: "resumeDocuments:one",
  fileName: "resume.pdf",
  status: "ready",
  currentTitle: "E-commerce Manager",
  professionalDomain: "E-commerce",
  seniority: "mid",
  summary: "E-commerce manager",
  totalExperienceYears: 5,
  targetRoles: [
    {
      id: "catalogItems:role",
      labelEn: "E-commerce Manager",
      labelHe: null,
      isCustom: true,
    },
  ],
  skills: [
    {
      id: "catalogItems:shopify",
      labelEn: "Shopify",
      labelHe: null,
      isCustom: true,
    },
    {
      id: "catalogItems:woo",
      labelEn: "WooCommerce",
      labelHe: null,
      isCustom: true,
    },
  ],
  location: {
    placeId: "geonames:293703",
    formattedAddress: "Rishon LeZion",
    city: "Rishon LeZion",
    country: "Israel",
    countryCode: "IL",
    latitude: 31.97102,
    longitude: 34.78939,
    radiusKm: 25,
  },
  needsLocation: false,
  failureCode: null,
  createdAt: 1,
};

describe("resume-first onboarding", () => {
  beforeAll(async () => initializeI18n());
  beforeEach(async () => {
    hooks.generate.mockReset().mockResolvedValue("https://upload.example");
    hooks.create.mockReset().mockResolvedValue("resumeDocuments:new");
    hooks.finish.mockReset().mockResolvedValue(null);
    hooks.process.mockReset().mockResolvedValue(null);
    hooks.catalogMutation.mockReset();
    vi.restoreAllMocks();
    await i18n.changeLanguage("en");
  });

  it("starts with one clear CV upload action and accepts only PDF or DOCX", () => {
    render(<ResumeOnboarding resume={null} onEdit={vi.fn()} />);
    expect(
      screen.getByRole("heading", { name: "Upload your CV" }),
    ).toBeInTheDocument();
    const input = screen.getByLabelText("Upload CV");
    expect(input).toHaveAttribute("accept", expect.stringContaining(".pdf"));
    expect(input).toHaveAttribute("accept", expect.stringContaining(".docx"));
  });

  it("lets the user skip CV upload and fill the profile manually", async () => {
    const user = userEvent.setup();
    const onManualEntry = vi.fn();
    render(
      <ResumeOnboarding
        resume={null}
        onEdit={vi.fn()}
        onManualEntry={onManualEntry}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Fill in my profile manually" }),
    );

    expect(onManualEntry).toHaveBeenCalledOnce();
  });

  it("uploads the actual file before starting structured processing", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ storageId: "_storage:file" }),
      }),
    );
    render(<ResumeOnboarding resume={null} onEdit={vi.fn()} />);
    const file = new File(["real cv content"], "career.pdf", {
      type: "application/pdf",
    });
    await user.upload(screen.getByLabelText("Upload CV"), file);
    await waitFor(() =>
      expect(hooks.process).toHaveBeenCalledWith({
        resumeId: "resumeDocuments:new",
      }),
    );
    expect(hooks.create).toHaveBeenCalledWith({
      storageId: "_storage:file",
      fileName: "career.pdf",
      mimeType: "application/pdf",
      size: file.size,
    });
  });

  it("accepts one dropped PDF and rejects multiple dropped files", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ storageId: "_storage:file" }),
      }),
    );
    const view = render(<ResumeOnboarding resume={null} onEdit={vi.fn()} />);
    const dropzone = screen.getByRole("button", {
      name: "Drop a resume here or click to browse",
    });
    const pdf = new File(["cv"], "career.pdf", { type: "application/pdf" });
    fireEvent.drop(dropzone, { dataTransfer: { files: [pdf] } });
    await waitFor(() => expect(hooks.process).toHaveBeenCalledOnce());
    view.unmount();
    render(<ResumeOnboarding resume={null} onEdit={vi.fn()} />);
    fireEvent.drop(
      screen.getByRole("button", {
        name: "Drop a resume here or click to browse",
      }),
      {
        dataTransfer: {
          files: [
            pdf,
            new File(["cv2"], "other.pdf", { type: "application/pdf" }),
          ],
        },
      },
    );
    expect(
      await screen.findByText("Upload one file at a time."),
    ).toBeInTheDocument();
  });

  it("does not tell users to replace a previously scanned PDF", async () => {
    expect(processingErrorKey(new ConvexError({ code: "SCANNED_PDF" }))).toBe(
      "parsing",
    );
    render(
      <ResumeOnboarding
        resume={
          {
            ...readyResume,
            status: "failed",
            failureCode: "SCANNED_PDF",
          } as never
        }
        onEdit={vi.fn()}
        onManualEntry={vi.fn()}
      />,
    );
    expect(
      await screen.findByText(/couldn’t analyze the CV/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Fill in my profile manually" }),
    ).toBeInTheDocument();
  });

  it("shows a compact summary and sends the effective profile straight to jobs", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(
      <ResumeOnboarding
        resume={readyResume as never}
        onEdit={vi.fn()}
        onComplete={onComplete}
      />,
    );
    expect(
      await screen.findByRole("heading", {
        name: "Your career profile is ready",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("E-commerce Manager")).toBeInTheDocument();
    expect(screen.getByText("Shopify")).toBeInTheDocument();
    expect(screen.getByText("Rishon LeZion")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Find jobs for me" }));
    expect(hooks.finish).toHaveBeenCalledOnce();
    const finishArgs: unknown = hooks.finish.mock.calls[0]?.[0];
    expect(finishArgs).toMatchObject({
      targetJobTitleIds: ["catalogItems:role"],
    });
    if (
      !finishArgs ||
      typeof finishArgs !== "object" ||
      !("location" in finishArgs)
    )
      throw new Error("Expected a normalized location");
    expect(finishArgs.location).toMatchObject({
      city: "Rishon LeZion",
      radiusKm: 25,
    });
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("asks only for the missing matching-critical location", async () => {
    render(
      <ResumeOnboarding
        resume={
          {
            ...readyResume,
            status: "needs_confirmation",
            location: null,
            needsLocation: true,
          } as never
        }
        onEdit={vi.fn()}
      />,
    );
    expect(await screen.findByText(/Choose one location/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Find jobs for me" }),
    ).toBeDisabled();
  });

  it("lets an existing user replace a CV without opening the long profile form", () => {
    render(
      <ResumeOnboarding
        resume={readyResume as never}
        replaceMode
        onEdit={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Upload your CV" }),
    ).toBeInTheDocument();
  });
});
