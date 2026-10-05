/// <reference types="vite/client" />
// @vitest-environment node

import JSZip from "jszip";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
const parseAi = vi.hoisted(() => vi.fn());
vi.mock("openai", () => ({
  default: class {
    responses = { parse: parseAi };
  },
}));
const modules = import.meta.glob("./**/*.ts");
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanExtractedResumeText,
  extractResumeText,
  formatExtractionCatalog,
  insufficientTextFailureCode,
  meaningfulCharacterCount,
  pdfDataUrl,
  resolveMammothExtractRawText,
  shouldUsePdfVisionFallback,
} from "./resumeActions";

async function docxWithText(text: string) {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
  );
  return await zip.generateAsync({ type: "uint8array" });
}

function pdfWithText(text: string) {
  const stream = `BT /F1 12 Tf 72 720 Td (${text.replace(/[()\\]/gu, "\\$&")}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${offset.toString().padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

describe("CV text extraction", () => {
  it("reads actual text from a DOCX body", async () => {
    const bytes = await docxWithText(
      "E-commerce Manager with Shopify and WooCommerce experience",
    );
    const text = await extractResumeText(
      new Blob([Uint8Array.from(bytes)]),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(text).toContain("E-commerce Manager");
    expect(text).toContain("Shopify");
  });

  it("supports Mammoth's CommonJS default export in the Convex bundle", async () => {
    const extractRawText = vi.fn().mockResolvedValue({ value: "טקסט תקין" });
    const resolved = resolveMammothExtractRawText({
      default: { extractRawText },
    });
    await expect(resolved({ buffer: Buffer.from("fixture") })).resolves.toEqual(
      { value: "טקסט תקין" },
    );
    expect(extractRawText).toHaveBeenCalledOnce();
  });

  it("reads actual text from a PDF content stream", async () => {
    const bytes = pdfWithText("Product Manager with analytics experience");
    const text = await extractResumeText(new Blob([bytes]), "application/pdf");
    expect(text).toContain("Product Manager");
    expect(text).toContain("analytics");
  });

  it("detects PDF bytes even when the browser MIME is generic", async () => {
    const bytes = pdfWithText("Operations Manager with ecommerce experience");
    const text = await extractResumeText(
      new Blob([bytes]),
      "application/octet-stream",
    );
    expect(text).toContain("Operations Manager");
  });

  it("counts Hebrew letters as meaningful CV content", () => {
    expect(
      meaningfulCharacterCount("ניהול מסחר אלקטרוני Shopify"),
    ).toBeGreaterThan(20);
  });

  it("does not reject a scanned PDF as empty", () => {
    expect(insufficientTextFailureCode("pdf", " \n ")).toBeNull();
    expect(insufficientTextFailureCode("docx", " \n ")).toBe(
      "EMPTY_EXTRACTED_TEXT",
    );
    expect(
      insufficientTextFailureCode(
        "pdf",
        "ניסיון מקצועי משמעותי בניהול מסחר אלקטרוני ופיתוח אתרים Shopify",
      ),
    ).toBeNull();
  });

  it("routes image-only PDFs to the model file input", () => {
    expect(shouldUsePdfVisionFallback("pdf", " \n ")).toBe(true);
    expect(shouldUsePdfVisionFallback("docx", " \n ")).toBe(false);
    expect(pdfDataUrl(new Uint8Array([1, 2, 3]).buffer)).toBe(
      "data:application/pdf;base64,AQID",
    );
  });

  it("formats existing roles, skills, and aliases as extraction references", () => {
    const catalog = formatExtractionCatalog([
      {
        kind: "jobTitle",
        labelEn: "Data Entry Clerk",
        labelHe: "קלדן נתונים",
        aliases: ["מקליד נתונים"],
      },
      {
        kind: "skill",
        labelEn: "Fast Typing",
        labelHe: "הקלדה מהירה",
        aliases: ["מקליד מהר"],
      },
      {
        kind: "experienceDomain",
        labelEn: "Insurance",
        labelHe: "ביטוח",
        aliases: [],
      },
    ]);
    expect(catalog).toContain("Data Entry Clerk | קלדן נתונים");
    expect(catalog).toContain("Fast Typing | הקלדה מהירה");
    expect(catalog).toContain("aliases: מקליד מהר");
    expect(catalog).toContain(
      "EXISTING EXPERIENCE AREAS:\n- Insurance | ביטוח",
    );
  });

  it("rejects malformed DOCX bytes and keeps empty extraction visibly empty", async () => {
    await expect(
      extractResumeText(
        new Blob(["not a docx"]),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).rejects.toThrow();
    expect(cleanExtractedResumeText(" \n \u0000 ")).toBe("");
  });
});

describe("document and profile processing boundaries", () => {
  beforeEach(() => {
    parseAi.mockReset();
    vi.stubEnv("OPENAI_API_KEY", "test");
    vi.stubEnv("OPENAI_JOB_SEARCH_MODEL", "test-model");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  const identity = (t: TestConvex<typeof schema>, userId: Id<"users">) =>
    t.withIdentity({
      subject: `${userId}|test`,
      issuer: "test",
      tokenIdentifier: `test|${userId}`,
    });
  async function uploadFixture(
    t: TestConvex<typeof schema>,
    file: Blob,
    activateOnSuccess = false,
    cachedText?: string,
  ) {
    return t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "owner@example.com",
        name: "Owner",
      });
      const storageId = await ctx.storage.store(file);
      const resumeId = await ctx.db.insert("resumeDocuments", {
        userId,
        storageId,
        fileName: "resume.pdf",
        mimeType: file.type,
        size: file.size,
        activateOnSuccess,
        status: "processing",
        extractedText: cachedText,
        createdAt: 1,
        updatedAt: 1,
      });
      return { userId, resumeId };
    });
  }
  it("processes an ordinary DOCX without AI or profile writes", async () => {
    const t = convexTest(schema, modules);
    const text =
      "Frontend developer with React, TypeScript and extensive professional experience.";
    const file = new Blob([Uint8Array.from(await docxWithText(text))], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const { userId, resumeId } = await uploadFixture(t, file);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, blob: async () => file }),
    );
    await identity(t, userId).action(api.resumeActions.processResume, {
      resumeId,
    });
    const row = await t.run((ctx) => ctx.db.get("resumeDocuments", resumeId));
    expect(row?.status).toBe("ready");
    expect(row?.extractedText).toBe(text);
    expect(row?.structuredProfileJson).toBeUndefined();
    expect(parseAi).not.toHaveBeenCalled();
    expect(
      await t.run((ctx) => ctx.db.query("candidateProfiles").first()),
    ).toBeNull();
  });
  it("transcribes a scanned document once and saves that complete text", async () => {
    const t = convexTest(schema, modules);
    const file = new Blob([pdfWithText("")], { type: "application/pdf" });
    const { userId, resumeId } = await uploadFixture(t, file);
    const text =
      "Scanned resume: work history, qualifications and all original document wording.";
    parseAi.mockResolvedValue({
      id: "ocr-result",
      model: "test-model",
      status: "completed",
      output_parsed: { text },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, blob: async () => file }),
    );
    await identity(t, userId).action(api.resumeActions.processResume, {
      resumeId,
    });
    expect(parseAi).toHaveBeenCalledOnce();
    expect(
      (await t.run((ctx) => ctx.db.get("resumeDocuments", resumeId)))
        ?.extractedText,
    ).toBe(text);
    expect(
      await t.run((ctx) => ctx.db.query("candidateProfiles").first()),
    ).toBeNull();
  });
  it("keeps scanned onboarding text for later reviews while prefilling the existing onboarding profile", async () => {
    const t = convexTest(schema, modules);
    const file = new Blob([pdfWithText("")], { type: "application/pdf" });
    const { userId, resumeId } = await uploadFixture(t, file, true);
    const text =
      "Complete original scanned resume wording with frontend experience and React skills.";
    parseAi
      .mockResolvedValueOnce({
        id: "transcription",
        model: "test-model",
        status: "completed",
        output_parsed: { text },
      })
      .mockResolvedValueOnce({
        id: "profile",
        model: "test-model",
        status: "completed",
        output_parsed: {
          currentTitle: "Frontend Engineer",
          normalizedCurrentTitle: "Frontend Engineer",
          professionalDomain: "Software Development",
          seniority: "mid",
          summary: "Frontend engineer with React experience.",
          roles: [],
          skills: {
            technical: ["React"],
            platforms: [],
            tools: [],
            business: [],
            ecommerce: [],
            productProject: [],
            marketingDigital: [],
            management: [],
          },
          education: [],
          languages: [],
          location: null,
          targetRoles: [
            {
              title: "Frontend Engineer",
              reason: "Experience",
              confidence: "high",
            },
          ],
          confidence: {
            currentTitle: "high",
            location: "low",
            dates: "low",
            targetRoles: "high",
          },
        },
      });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, blob: async () => file }),
    );
    await identity(t, userId).action(api.resumeActions.processResume, {
      resumeId,
    });
    expect(parseAi).toHaveBeenCalledTimes(2);
    expect(parseAi.mock.calls[1][0].input[1].content).toContain(text);
    expect(
      (await t.run((ctx) => ctx.db.get("resumeDocuments", resumeId)))
        ?.extractedText,
    ).toBe(text);
    const profile = await t.run((ctx) =>
      ctx.db.query("candidateProfiles").first(),
    );
    expect(profile?.activeResumeId).toBe(resumeId);
    expect(profile?.onboardingCompleted).toBe(false);
    expect(profile?.cvReviewPending).toBe(true);
  });
  it("keeps cached document text when onboarding AI parsing fails", async () => {
    const t = convexTest(schema, modules);
    const text =
      "A complete factual resume with sufficient meaningful text and experience.";
    const { userId, resumeId } = await uploadFixture(
      t,
      new Blob(["unused"]),
      true,
      text,
    );
    parseAi.mockRejectedValue(new Error("provider failure"));
    await expect(
      identity(t, userId).action(api.resumeActions.processResume, { resumeId }),
    ).rejects.toThrow("CV_AI_PARSE_FAILED");
    expect(
      (await t.run((ctx) => ctx.db.get("resumeDocuments", resumeId)))
        ?.extractedText,
    ).toBe(text);
  });
  it("uses cached text for explicit profile analysis and leaves a saved document usable on failure", async () => {
    const t = convexTest(schema, modules);
    const text =
      "Saved factual document content with enough professional history and evidence.";
    const { userId, resumeId } = await uploadFixture(
      t,
      new Blob(["unused"]),
      false,
      text,
    );
    await t.run((ctx) =>
      ctx.db.patch("resumeDocuments", resumeId, { status: "ready" }),
    );
    const fetchFile = vi.fn();
    vi.stubGlobal("fetch", fetchFile);
    parseAi.mockRejectedValue(new Error("provider failure"));
    await expect(
      identity(t, userId).action(api.resumeActions.prepareProfileUpdate, {
        resumeId,
      }),
    ).rejects.toThrow("CV_AI_PARSE_FAILED");
    expect(fetchFile).not.toHaveBeenCalled();
    const row = await t.run((ctx) => ctx.db.get("resumeDocuments", resumeId));
    expect(row?.status).toBe("ready");
    expect(row?.extractedText).toBe(text);
    const otherId = await t.run((ctx) => ctx.db.insert("users", {}));
    await expect(
      identity(t, otherId).action(api.resumeActions.prepareProfileUpdate, {
        resumeId,
      }),
    ).rejects.toThrow("RESUME_NOT_PROCESSING");
    expect(parseAi).toHaveBeenCalledOnce();
  });
});
