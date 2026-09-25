"use node";

import type OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  JOB_DISCOVERY_LIMITS,
  normalizeJob,
  normalizePublicUrl,
  openAIJobBatchSchema,
  type NormalizedJob,
} from "./jobDiscoveryModel";

const MAX_OUTPUT_TEXT_DIAGNOSTIC_LENGTH = 12_000;
const MAX_RAW_RESPONSE_DIAGNOSTIC_LENGTH = 24_000;
const TOKEN_EXHAUSTION_FALLBACK_JOBS = 3;

export type JobSearchProviderDiagnostics = {
  responseId?: string;
  responseStatus: string;
  parsed: boolean;
  incompleteReason?: string;
  errorCode?: string;
  errorMessage?: string;
  outputTextExcerpt?: string;
  rawResponseExcerpt: string;
};

export class JobSearchProviderResponseError extends Error {
  readonly diagnostics: JobSearchProviderDiagnostics;

  constructor(diagnostics: JobSearchProviderDiagnostics) {
    super("JOB_SEARCH_PROVIDER_UNPARSED_RESPONSE");
    this.name = "JobSearchProviderResponseError";
    this.diagnostics = diagnostics;
  }
}

function bounded(value: string, maximum: number) {
  return value.slice(0, maximum);
}

type ProviderResponseDiagnosticsInput = {
  id?: string;
  status?: string;
  incomplete_details?: { reason?: string } | null;
  error?: { code?: string | null; message?: string } | null;
  output: unknown;
  output_text?: string;
  output_parsed: unknown;
};

function providerDiagnostics(
  response: ProviderResponseDiagnosticsInput,
): JobSearchProviderDiagnostics {
  const rawResponse = JSON.stringify({
    id: response.id,
    status: response.status,
    incompleteDetails: response.incomplete_details,
    error: response.error,
    output: response.output,
  });
  return {
    ...(response.id ? { responseId: response.id } : {}),
    responseStatus: response.status ?? "unknown",
    parsed: response.output_parsed != null,
    ...(response.incomplete_details?.reason
      ? { incompleteReason: response.incomplete_details.reason }
      : {}),
    ...(response.error?.code ? { errorCode: response.error.code } : {}),
    ...(response.error?.message
      ? {
          errorMessage: bounded(
            response.error.message,
            MAX_OUTPUT_TEXT_DIAGNOSTIC_LENGTH,
          ),
        }
      : {}),
    ...(response.output_text
      ? {
          outputTextExcerpt: bounded(
            response.output_text,
            MAX_OUTPUT_TEXT_DIAGNOSTIC_LENGTH,
          ),
        }
      : {}),
    rawResponseExcerpt: bounded(
      rawResponse,
      MAX_RAW_RESPONSE_DIAGNOSTIC_LENGTH,
    ),
  };
}

function collectProviderSourceUrls(output: unknown) {
  const urls = new Set<string>();
  let webSearchToolCallCount = 0;
  if (!Array.isArray(output)) return { urls, webSearchToolCallCount };
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === "object";
  for (const item of output as unknown[]) {
    if (!isRecord(item) || item.type !== "web_search_call") continue;
    webSearchToolCallCount += 1;
    const action = item.action;
    if (!isRecord(action)) continue;
    const values: unknown[] = [];
    if ("url" in action) values.push(action.url);
    if (Array.isArray(action.sources)) {
      for (const source of action.sources as unknown[]) {
        if (isRecord(source)) {
          values.push(source.url);
        }
      }
    }
    for (const value of values) {
      if (typeof value !== "string") continue;
      const normalized = normalizePublicUrl(value);
      if (normalized) urls.add(normalized);
    }
  }
  return { urls, webSearchToolCallCount };
}

function addUsage(
  usage: { inputTokens: number; outputTokens: number; totalTokens: number },
  response: {
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
    } | null;
  },
) {
  usage.inputTokens += response.usage?.input_tokens ?? 0;
  usage.outputTokens += response.usage?.output_tokens ?? 0;
  usage.totalTokens += response.usage?.total_tokens ?? 0;
}

async function requestJobBatch(
  client: OpenAI,
  model: string,
  searchQuery: string,
  maxOutputTokens: number,
  maxCandidates: number,
  compactFallback: boolean,
) {
  return await client.responses.parse({
    model,
    store: false,
    max_output_tokens: Math.min(
      maxOutputTokens,
      JOB_DISCOVERY_LIMITS.absoluteMaxOutputTokens,
    ),
    max_tool_calls: compactFallback ? 3 : 4,
    include: ["web_search_call.action.sources"],
    tools: [
      {
        type: "web_search",
        search_context_size: compactFallback ? "low" : "medium",
      },
    ],
    input: [
      {
        role: "system",
        content: [
          "Find current real job vacancies in Israel matching the requested role or its strongest equivalent titles.",
          "Search both English and Hebrew title variants. Prefer vacancies published in the last 60 days when the source shows a date.",
          "Prioritize exact employer career and public ATS pages; exact vacancy pages on major reputable job boards and recruiting agencies are also valid.",
          "Preserve every exact source URL found for the same vacancy, especially an employer or ATS URL. Source quality is a preference, never a requirement.",
          "Discovery finds candidates only; deterministic verification and matching happen later. Never invent facts, dates, or URLs.",
          "Extract experience requirements exactly in years: for a range use its lower and upper bounds, for X+ or a stated minimum use X as the minimum and null as the maximum, for an exact X years use X for both, and use null when the source is silent.",
          "Treat entry-level or junior wording without a numeric requirement as a 0-year minimum. Apply the same rules to Hebrew descriptions.",
          "Use null or empty arrays when the source does not state a field. Every job URL and evidence URL must come from web search sources.",
          `Return at most ${maxCandidates} useful candidates. Keep descriptions, requirements, lists, and evidence concise.`,
          compactFallback
            ? "This is a compact retry: prioritize the strongest exact matches and omit nonessential detail."
            : "Do not return an empty jobs array unless the searches found no exact current vacancy pages.",
        ].join(" "),
      },
      { role: "user", content: searchQuery },
    ],
    text: {
      format: zodTextFormat(openAIJobBatchSchema, "job_search_results"),
    },
  });
}

export async function searchJobsWithOpenAI(
  client: OpenAI,
  model: string,
  generatedQueries: string[],
  limits: {
    maxQueries: number;
    maxAcceptedJobs: number;
    maxOutputTokens: number;
  },
) {
  const accepted: NormalizedJob[] = [];
  const candidateUrls = new Set<string>();
  let returnedCandidateCount = 0;
  let rejectedCount = 0;
  const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  let webSearchToolCallCount = 0;
  let diagnostics: JobSearchProviderDiagnostics | undefined;
  for (const searchQuery of generatedQueries.slice(
    0,
    Math.min(limits.maxQueries, JOB_DISCOVERY_LIMITS.maxQueries),
  )) {
    const primaryCandidateLimit = Math.min(
      limits.maxAcceptedJobs,
      JOB_DISCOVERY_LIMITS.maxJobsPerQuery,
    );
    let response = await requestJobBatch(
      client,
      model,
      searchQuery,
      limits.maxOutputTokens,
      primaryCandidateLimit,
      false,
    );
    addUsage(usage, response);
    diagnostics = providerDiagnostics(response);
    if (
      !response.output_parsed &&
      diagnostics.incompleteReason === "max_output_tokens"
    ) {
      response = await requestJobBatch(
        client,
        model,
        searchQuery,
        limits.maxOutputTokens,
        Math.min(primaryCandidateLimit, TOKEN_EXHAUSTION_FALLBACK_JOBS),
        true,
      );
      addUsage(usage, response);
      diagnostics = providerDiagnostics(response);
    }
    if (!response.output_parsed) {
      throw new JobSearchProviderResponseError(diagnostics);
    }
    const provider = collectProviderSourceUrls(response.output);
    webSearchToolCallCount += provider.webSearchToolCallCount;
    const candidates = response.output_parsed.jobs;
    returnedCandidateCount += candidates.length;
    for (const candidate of candidates) {
      const url = normalizePublicUrl(candidate.sourceUrl);
      if (url) candidateUrls.add(url);
    }
    for (const candidate of candidates.slice(
      0,
      JOB_DISCOVERY_LIMITS.maxJobsPerQuery,
    )) {
      const job = normalizeJob(candidate, provider.urls);
      if (!job) rejectedCount += 1;
      else accepted.push(job);
      if (accepted.length === limits.maxAcceptedJobs) break;
    }
    if (accepted.length === limits.maxAcceptedJobs) break;
  }
  rejectedCount += Math.max(
    0,
    returnedCandidateCount - accepted.length - rejectedCount,
  );
  return {
    accepted,
    candidateUrls: [...candidateUrls],
    returnedCandidateCount,
    rejectedCount,
    usage,
    webSearchToolCallCount,
    diagnostics,
  };
}
