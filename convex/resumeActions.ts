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

async function extractPdf(buffer: ArrayBuffer) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
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
  return pages.join("\n");
}

export async function extractResumeText(blob: Blob, mimeType: string) {
  const buffer = await blob.arrayBuffer();
  if (mimeType === "application/pdf") return await extractPdf(buffer);
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
  return result.value;
}

export function cleanExtractedResumeText(value: string) {
  return value
    .normalize("NFKC")
    .split("\0")
    .join("")
    .replace(/[ \t]+/gu, " ")
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
    try {
      const url = await ctx.storage.getUrl(resume.storageId);
      if (!url) throw new Error("storage_unavailable");
      const response = await fetch(url);
      if (!response.ok) throw new Error("storage_unavailable");
      const text = cleanExtractedResumeText(
        await extractResumeText(await response.blob(), resume.mimeType),
      );
      if (text.length < 80) throw new ConvexError({ code: "EMPTY_RESUME" });
      const apiKey = env.OPENAI_API_KEY?.trim();
      const model =
        process.env.OPENAI_CV_MODEL?.trim() ||
        env.OPENAI_JOB_SEARCH_MODEL?.trim();
      if (!apiKey || !model)
        throw new ConvexError({ code: "CV_CONFIGURATION_ERROR" });
      const client = new OpenAI({ apiKey, maxRetries: 1, timeout: 60_000 });
      const parsed = await client.responses.parse({
        model,
        store: false,
        max_output_tokens: 7_000,
        input: [
          {
            role: "system",
            content:
              "Extract a factual career profile from the supplied CV text. Use only facts present in the CV. Never infer achievements, responsibilities, dates, location, language proficiency, degrees, or employers that are not supported. Return null or an empty array for missing data. Normalize job titles and skill spelling conservatively while keeping meaningfully different technologies separate. Infer only 3-5 strong target roles from recent/strong experience and professional trajectory; do not suggest unrelated careers. Dates use YYYY-MM when known, YYYY when only the year is known, or null. Confidence describes evidence quality, not optimism.",
          },
          { role: "user", content: text },
        ],
        text: {
          format: zodTextFormat(resumeExtractionSchema, "career_profile"),
        },
      });
      if (!parsed.output_parsed) throw new Error("invalid_structured_output");
      const normalized = normalizeResumeExtraction(parsed.output_parsed);
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
      return null;
    } catch (error) {
      const errorData: unknown =
        error instanceof ConvexError ? error.data : null;
      const code =
        errorData && typeof errorData === "object" && "code" in errorData
          ? String(errorData.code)
          : "RESUME_PROCESSING_FAILED";
      await ctx.runMutation(internal.resumes.failProcessing, {
        resumeId: resume._id,
        userId,
        failureCode: code,
      });
      throw error;
    }
  },
});

export const seedDevelopmentResume = action({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "UNAUTHENTICATED" });
    if (env.DEV_TOOLS_ENABLED !== "true") {
      throw new ConvexError({ code: "DEV_TOOLS_DISABLED" });
    }
    const storageId = await ctx.storage.store(
      new Blob(["development CV fixture"], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    );
    const resumeId = await ctx.runMutation(
      internal.resumes.createDevelopmentDocument,
      { userId, storageId },
    );
    await ctx.runMutation(internal.resumes.completeProcessing, {
      resumeId,
      userId,
      extractedText:
        "E-commerce Manager at Demo Commerce, 2020-2025. Managed Shopify and WooCommerce website operations in Rishon LeZion.",
      structuredProfileJson: JSON.stringify({ fixture: true }),
      currentTitle: "E-commerce Manager",
      professionalDomain: "E-commerce",
      seniority: "mid",
      summary:
        "E-commerce manager with Shopify, WooCommerce and website operations experience.",
      targetRoles: [
        "E-commerce Manager",
        "Website Manager",
        "E-commerce Operations Manager",
      ],
      skills: [
        "Shopify",
        "WooCommerce",
        "HTML",
        "CSS",
        "Website Operations",
        "Supplier Management",
      ],
      normalizedLocation: {
        placeId: "geonames:293703",
        formattedAddress: "Rishon LeZion",
        city: "Rishon LeZion",
        country: "Israel",
        countryCode: "IL",
        latitude: 31.97102,
        longitude: 34.78939,
        radiusKm: 25,
      },
      totalExperienceMonths: 60,
      normalizedPastRoles: ["Website Manager", "E-commerce Manager"],
      domains: ["E-commerce"],
      experienceByDomain: [{ domain: "e-commerce", months: 60 }],
      languages: [],
      confidence: {
        currentTitle: "high",
        location: "high",
        dates: "high",
        targetRoles: "high",
      },
    });
    return null;
  },
});
