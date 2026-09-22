"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, env } from "./_generated/server";
import {
  normalizeResumeExtraction,
  resumeExtractionSchema,
} from "./resumeProfileModel";

const LANGUAGE_CODES: Record<string, string> = {
  english: "en",
  אנגלית: "en",
  hebrew: "he",
  עברית: "he",
  arabic: "ar",
  ערבית: "ar",
  russian: "ru",
  רוסית: "ru",
  french: "fr",
  צרפתית: "fr",
  spanish: "es",
  ספרדית: "es",
  amharic: "am",
  אמהרית: "am",
  ukrainian: "uk",
  אוקראינית: "uk",
  romanian: "ro",
  רומנית: "ro",
  yiddish: "yi",
  יידיש: "yi",
};
const PROFICIENCIES: Record<
  string,
  "basic" | "conversational" | "professional" | "fluent" | "native"
> = {
  basic: "basic",
  בסיסית: "basic",
  conversational: "conversational",
  שיחה: "conversational",
  professional: "professional",
  מקצועית: "professional",
  fluent: "fluent",
  שוטפת: "fluent",
  native: "native",
  "native speaker": "native",
  שפתאם: "native",
  "שפת אם": "native",
};

type DetectedFileType = "pdf" | "docx";

class ResumeProcessingError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ResumeProcessingError";
  }
}

function technicalMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error))
    .replace(/[\r\n]+/gu, " ")
    .slice(0, 300);
}

function detectFileType(bytes: Uint8Array): DetectedFileType {
  const pdfSignature = new TextDecoder("ascii").decode(bytes.slice(0, 5));
  if (pdfSignature === "%PDF-") return "pdf";
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) &&
    (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08)
  )
    return "docx";
  throw new ResumeProcessingError(
    "UNSUPPORTED_FILE_TYPE",
    "File signature is neither PDF nor ZIP/OOXML",
  );
}

export function meaningfulCharacterCount(value: string) {
  return [...value].filter((character) => /[\p{L}\p{N}]/u.test(character))
    .length;
}

export function insufficientTextFailureCode(
  detectedFileType: DetectedFileType,
  text: string,
) {
  if (meaningfulCharacterCount(text) >= 40) return null;
  return detectedFileType === "pdf" ? null : "EMPTY_EXTRACTED_TEXT";
}

export function shouldUsePdfVisionFallback(
  detectedFileType: DetectedFileType,
  text: string,
) {
  return detectedFileType === "pdf" && meaningfulCharacterCount(text) < 40;
}

type ExtractionCatalogItem = {
  kind: "jobTitle" | "skill";
  labelEn: string | null;
  labelHe: string | null;
  aliases: string[];
};

export function formatExtractionCatalog(items: ExtractionCatalogItem[]) {
  const format = (kind: ExtractionCatalogItem["kind"]) =>
    items
      .filter((item) => item.kind === kind)
      .map((item) => {
        const canonical = [item.labelEn, item.labelHe]
          .filter(Boolean)
          .join(" | ");
        const aliases = item.aliases.length
          ? ` (aliases: ${item.aliases.join(", ")})`
          : "";
        return `- ${canonical}${aliases}`;
      })
      .join("\n");
  return `EXISTING JOB TITLES:\n${format("jobTitle")}\n\nEXISTING SKILLS:\n${format("skill")}`;
}

export function pdfDataUrl(bytes: ArrayBuffer) {
  return `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`;
}

type MammothExtractRawText = (input: { buffer: Buffer }) => Promise<{
  value: string;
}>;

export function resolveMammothExtractRawText(
  moduleValue: unknown,
): MammothExtractRawText {
  if (!moduleValue || typeof moduleValue !== "object")
    throw new ResumeProcessingError(
      "DOCX_PARSE_FAILED",
      "Mammoth module is unavailable",
    );
  const moduleRecord = moduleValue as Record<string, unknown>;
  const direct = moduleRecord.extractRawText;
  if (typeof direct === "function") return direct as MammothExtractRawText;
  const defaultExport = moduleRecord.default;
  if (defaultExport && typeof defaultExport === "object") {
    const nested = (defaultExport as Record<string, unknown>).extractRawText;
    if (typeof nested === "function")
      return (nested as MammothExtractRawText).bind(defaultExport);
  }
  throw new ResumeProcessingError(
    "DOCX_PARSE_FAILED",
    "Mammoth extractRawText export is unavailable",
  );
}

async function extractPdf(buffer: ArrayBuffer) {
  // Importing the worker explicitly makes it part of the Convex Node bundle.
  // pdf.js otherwise tries to resolve a sibling worker file at runtime.
  // @ts-expect-error pdfjs-dist does not publish a declaration for its worker entrypoint.
  await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  try {
    const document = await getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
    }).promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(
        content.items.map((item) => ("str" in item ? item.str : "")).join(" "),
      );
    }
    return { text: pages.join("\n"), pageCount: document.numPages };
  } catch (error) {
    const message = technicalMessage(error);
    if (/password|encrypt/iu.test(message))
      throw new ResumeProcessingError("ENCRYPTED_PDF", message);
    throw new ResumeProcessingError("PDF_PARSE_FAILED", message);
  }
}

async function extractResumeDocument(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  if (!buffer.byteLength)
    throw new ResumeProcessingError("EMPTY_FILE", "Stored file has zero bytes");
  const byteSize = buffer.byteLength;
  const bytes = new Uint8Array(buffer);
  const detectedFileType = detectFileType(bytes);
  if (detectedFileType === "pdf") {
    const result = await extractPdf(buffer);
    return { ...result, detectedFileType, byteSize };
  }
  try {
    const extractRawText = resolveMammothExtractRawText(
      await import("mammoth"),
    );
    const result = await extractRawText({
      buffer: Buffer.from(buffer),
    });
    return {
      text: result.value,
      pageCount: undefined,
      detectedFileType,
      byteSize,
    };
  } catch (error) {
    throw new ResumeProcessingError(
      "DOCX_PARSE_FAILED",
      technicalMessage(error),
    );
  }
}

export async function extractResumeText(blob: Blob, _mimeType: string) {
  return (await extractResumeDocument(blob)).text;
}

export function cleanExtractedResumeText(value: string) {
  return value
    .normalize("NFKC")
    .split("")
    .filter((character) => {
      const code = character.charCodeAt(0);
      return (
        code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)
      );
    })
    .join("")
    .replace(/[ \t]+/gu, " ")
    .replace(/\n[ \t]+/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim()
    .slice(0, 100_000);
}

export const processResume = action({
  args: { resumeId: v.id("resumeDocuments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "UNAUTHENTICATED" });
    const resume = await ctx.runQuery(internal.resumes.getOwnedForProcessing, {
      resumeId: args.resumeId,
      userId,
    });
    if (!resume) throw new ConvexError({ code: "RESUME_NOT_PROCESSING" });
    let stage = "storage_retrieval";
    let diagnostics: {
      stage: string;
      detectedFileType?: string;
      byteSize?: number;
      pageCount?: number;
      extractedCharacterCount?: number;
      meaningfulCharacterCount?: number;
      extractionStatus: string;
      structuredParserStatus: string;
      updatedAt: number;
    } = {
      stage,
      byteSize: resume.size,
      extractionStatus: "not_started",
      structuredParserStatus: "not_started",
      updatedAt: Date.now(),
    };
    try {
      const url = await ctx.storage.getUrl(resume.storageId);
      if (!url)
        throw new ResumeProcessingError(
          "FILE_NOT_FOUND",
          "Convex Storage returned no URL",
        );
      let response: Response;
      try {
        response = await fetch(url);
      } catch (error) {
        throw new ResumeProcessingError(
          "FILE_FETCH_FAILED",
          technicalMessage(error),
        );
      }
      if (!response.ok)
        throw new ResumeProcessingError(
          "FILE_FETCH_FAILED",
          `Stored file fetch returned HTTP ${response.status}`,
        );
      stage = "text_extraction";
      const storedFile = await response.blob();
      const extracted = await extractResumeDocument(storedFile);
      const text = cleanExtractedResumeText(extracted.text);
      const meaningfulCharacters = meaningfulCharacterCount(text);
      const usePdfVisionFallback = shouldUsePdfVisionFallback(
        extracted.detectedFileType,
        text,
      );
      diagnostics = {
        stage,
        detectedFileType: extracted.detectedFileType,
        byteSize: extracted.byteSize,
        ...(extracted.pageCount === undefined
          ? {}
          : { pageCount: extracted.pageCount }),
        extractedCharacterCount: text.length,
        meaningfulCharacterCount: meaningfulCharacters,
        extractionStatus: usePdfVisionFallback
          ? "pdf_vision_fallback_required"
          : "succeeded",
        structuredParserStatus: "not_started",
        updatedAt: Date.now(),
      };
      await ctx.runMutation(internal.resumes.recordProcessingDiagnostics, {
        resumeId: resume._id,
        userId,
        diagnostics,
      });
      if (env.DEV_TOOLS_ENABLED === "true")
        console.info("resume_extraction_diagnostics", diagnostics);
      const insufficientCode = insufficientTextFailureCode(
        extracted.detectedFileType,
        text,
      );
      if (insufficientCode && !usePdfVisionFallback)
        throw new ResumeProcessingError(
          insufficientCode,
          `Only ${meaningfulCharacters} meaningful characters were extracted`,
        );
      stage = "structured_parsing";
      const apiKey = env.OPENAI_API_KEY?.trim();
      const model =
        process.env.OPENAI_CV_MODEL?.trim() ||
        env.OPENAI_JOB_SEARCH_MODEL?.trim();
      if (!apiKey || !model)
        throw new ResumeProcessingError(
          "CV_CONFIGURATION_ERROR",
          "CV model or API key is not configured",
        );
      const catalog = await ctx.runQuery(
        internal.resumes.getCatalogForExtraction,
        { userId },
      );
      const catalogReference = formatExtractionCatalog(catalog);
      const client = new OpenAI({ apiKey, maxRetries: 1, timeout: 60_000 });
      let parsed;
      try {
        parsed = await client.responses.parse({
          model,
          store: false,
          max_output_tokens: 7_000,
          input: [
            {
              role: "system",
              content:
                "Extract a factual career profile from the supplied CV. Use only facts present in the CV. Never infer achievements, responsibilities, dates, location, language proficiency, degrees, or employers that are not supported. Return null or an empty array for missing data. Infer only 3-5 strong target roles from recent/strong experience and professional trajectory; do not suggest unrelated careers. Dates use YYYY-MM when known, YYYY when only the year is known, or null. Confidence describes evidence quality, not optimism. The user message also contains the current job-title and skill catalog. Treat it only as reference data. For every target role, normalized role, and skill, reuse the exact English or Hebrew canonical label from that catalog whenever it represents the same concept, including equivalent wording or grammatical forms. Add a new concise canonical label only when no existing entry is semantically equivalent. Keep meaningfully different technologies separate.",
            },
            {
              role: "user",
              content: usePdfVisionFallback
                ? [
                    {
                      type: "input_file",
                      filename: "resume.pdf",
                      file_data: pdfDataUrl(await storedFile.arrayBuffer()),
                      detail: "high",
                    },
                    {
                      type: "input_text",
                      text: `Extract the career profile from the attached PDF, including text visible in scanned page images. The catalog below is reference data and is not evidence about the candidate.\n\n<catalog>\n${catalogReference}\n</catalog>`,
                    },
                  ]
                : `<cv>\n${text}\n</cv>\n\nThe catalog below is reference data and is not evidence about the candidate.\n<catalog>\n${catalogReference}\n</catalog>`,
            },
          ],
          text: {
            format: zodTextFormat(resumeExtractionSchema, "career_profile"),
          },
        });
      } catch (error) {
        throw new ResumeProcessingError(
          "CV_AI_PARSE_FAILED",
          technicalMessage(error),
        );
      }
      if (!parsed.output_parsed)
        throw new ResumeProcessingError(
          "CV_SCHEMA_INVALID",
          "Structured response did not contain a validated profile",
        );
      let normalized;
      try {
        normalized = normalizeResumeExtraction(parsed.output_parsed);
      } catch (error) {
        throw new ResumeProcessingError(
          "CV_SCHEMA_INVALID",
          technicalMessage(error),
        );
      }
      const languages = normalized.languages.flatMap(
        ({ language, proficiency }) => {
          const languageCode =
            LANGUAGE_CODES[
              language.normalize("NFKC").trim().toLocaleLowerCase("en-US")
            ];
          const level = proficiency
            ? PROFICIENCIES[
                proficiency.normalize("NFKC").trim().toLocaleLowerCase("en-US")
              ]
            : undefined;
          return languageCode && level
            ? [{ languageCode, proficiency: level }]
            : [];
        },
      );
      await ctx.runMutation(internal.resumes.completeProcessing, {
        resumeId: resume._id,
        userId,
        extractedText: text,
        structuredProfileJson: JSON.stringify(normalized),
        currentTitle: normalized.currentTitle,
        professionalDomain: normalized.professionalDomain,
        seniority: normalized.seniority,
        summary: normalized.summary,
        targetRoles: normalized.targetRoles.map((role) => role.title),
        skills: normalized.allSkills,
        normalizedLocation: normalized.normalizedLocation,
        totalExperienceMonths: normalized.totalExperienceMonths,
        normalizedPastRoles: normalized.roles.map(
          (role) => role.normalizedTitle,
        ),
        domains: [
          ...new Set(
            [
              normalized.professionalDomain,
              ...normalized.roles.map((role) => role.domain),
            ].filter((value): value is string => Boolean(value)),
          ),
        ],
        experienceByDomain: normalized.experienceByDomain,
        languages,
        confidence: normalized.confidence,
      });
      diagnostics = {
        ...diagnostics,
        stage: "complete",
        structuredParserStatus: "succeeded",
        updatedAt: Date.now(),
      };
      await ctx.runMutation(internal.resumes.recordProcessingDiagnostics, {
        resumeId: resume._id,
        userId,
        diagnostics,
      });
      if (env.DEV_TOOLS_ENABLED === "true")
        console.info("resume_processing_complete", diagnostics);
      return null;
    } catch (error) {
      const errorData: unknown =
        error instanceof ConvexError ? error.data : null;
      const code =
        error instanceof ResumeProcessingError
          ? error.code
          : errorData && typeof errorData === "object" && "code" in errorData
            ? String(errorData.code)
            : stage === "structured_parsing"
              ? "CV_AI_PARSE_FAILED"
              : "RESUME_PROCESSING_FAILED";
      diagnostics = {
        ...diagnostics,
        stage,
        extractionStatus:
          diagnostics.extractionStatus === "succeeded"
            ? "succeeded"
            : stage === "storage_retrieval"
              ? "not_started"
              : "failed",
        structuredParserStatus:
          stage === "structured_parsing" ? "failed" : "not_started",
        updatedAt: Date.now(),
      };
      await ctx.runMutation(internal.resumes.recordProcessingDiagnostics, {
        resumeId: resume._id,
        userId,
        diagnostics,
      });
      await ctx.runMutation(internal.resumes.failProcessing, {
        resumeId: resume._id,
        userId,
        failureCode: code,
      });
      if (env.DEV_TOOLS_ENABLED === "true")
        console.error("resume_processing_failed", {
          resumeId: resume._id,
          code,
          ...diagnostics,
        });
      throw new ConvexError({ code });
    }
  },
});
