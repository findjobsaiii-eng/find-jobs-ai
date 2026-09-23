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
    hooks.process.mockReset().mockResolvedValue(null);
    hooks.catalogMutation.mockReset();
    vi.restoreAllMocks();
    await i18n.changeLanguage("en");
  });

  it("starts with one clear CV upload action and accepts only PDF or DOCX", () => {
    render(<ResumeOnboarding resume={null} />);
    expect(
      screen.getByRole("heading", { name: "Upload your CV" }),
    ).toBeInTheDocument();
    const input = screen.getByLabelText("Upload CV");
    expect(input).toHaveAttribute("accept", expect.stringContaining(".pdf"));
    expect(input).toHaveAttribute("accept", expect.stringContaining(".docx"));
  });

  it("shows active, accessible progress while reading the CV", () => {
    render(
      <ResumeOnboarding
        resume={{ ...readyResume, status: "processing" } as never}
      />,
    );

    expect(
      screen.getByRole("status", { name: "Reading your CV…" }),
    ).toHaveTextContent("This usually takes just a few moments.");
    expect(screen.getByText("Reading your experience")).toBeInTheDocument();
  });

  it("lets the user skip CV upload and fill the profile manually", async () => {
    const user = userEvent.setup();
    const onManualEntry = vi.fn();
    render(<ResumeOnboarding resume={null} onManualEntry={onManualEntry} />);

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
    render(<ResumeOnboarding resume={null} />);
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
    const view = render(<ResumeOnboarding resume={null} />);
    const dropzone = screen.getByRole("button", {
      name: "Drop a resume here or click to browse",
    });
    const pdf = new File(["cv"], "career.pdf", { type: "application/pdf" });
    fireEvent.drop(dropzone, { dataTransfer: { files: [pdf] } });
    await waitFor(() => expect(hooks.process).toHaveBeenCalledOnce());
    view.unmount();
    render(<ResumeOnboarding resume={null} />);
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

  it("replaces the existing CV only after the new upload is processed", async () => {
    const user = userEvent.setup();
    const onCancelReplacement = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ storageId: "_storage:replacement" }),
      }),
    );
    render(
      <ResumeOnboarding
        resume={readyResume as never}
        replaceMode
        onCancelReplacement={onCancelReplacement}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Upload your CV" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep current CV" }));
    expect(onCancelReplacement).toHaveBeenCalledOnce();

    const file = new File(["replacement cv"], "replacement.pdf", {
      type: "application/pdf",
    });
    await user.upload(screen.getByLabelText("Upload CV"), file);

    await waitFor(() =>
      expect(hooks.create).toHaveBeenCalledWith({
        storageId: "_storage:replacement",
        fileName: "replacement.pdf",
        mimeType: "application/pdf",
        size: file.size,
        replacementForId: "resumeDocuments:one",
      }),
    );
  });
});
