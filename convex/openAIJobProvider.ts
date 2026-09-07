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

function collectProviderSourceUrls(output: unknown) {
  const urls = new Set<string>();
  if (!Array.isArray(output)) return urls;
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === "object";
  for (const item of output as unknown[]) {
    if (!isRecord(item) || item.type !== "web_search_call") continue;
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
  return urls;
}

export async function searchJobsWithOpenAI(
  client: OpenAI,
  model: string,
  generatedQueries: string[],
) {
  const accepted: NormalizedJob[] = [];
  let returnedCandidateCount = 0;
  let rejectedCount = 0;
  const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  for (const searchQuery of generatedQueries.slice(
    0,
    JOB_DISCOVERY_LIMITS.maxQueries,
  )) {
    const response = await client.responses.parse({
      model,
      store: false,
      max_output_tokens: JOB_DISCOVERY_LIMITS.maxOutputTokens,
      max_tool_calls: 2,
      include: ["web_search_call.action.sources"],
      tools: [{ type: "web_search", search_context_size: "low" }],
      input: [
        {
          role: "system",
          content:
            "Find current public job postings matching the query. Prefer direct employer career pages and public ATS postings. Never invent facts. Use null or empty arrays when a source does not state a field. Salary is null unless explicitly stated. Every job URL and evidence URL must come from web search sources. Return at most 5 jobs.",
        },
        { role: "user", content: searchQuery },
      ],
      text: {
        format: zodTextFormat(openAIJobBatchSchema, "job_search_results"),
      },
    });
    usage.inputTokens += response.usage?.input_tokens ?? 0;
    usage.outputTokens += response.usage?.output_tokens ?? 0;
    usage.totalTokens += response.usage?.total_tokens ?? 0;
    const providerSources = collectProviderSourceUrls(response.output);
    const candidates = response.output_parsed?.jobs ?? [];
    returnedCandidateCount += candidates.length;
    for (const candidate of candidates.slice(
      0,
      JOB_DISCOVERY_LIMITS.maxJobsPerQuery,
    )) {
      const job = normalizeJob(candidate, providerSources);
      if (!job) rejectedCount += 1;
      else accepted.push(job);
      if (accepted.length === JOB_DISCOVERY_LIMITS.maxJobsPerRun) break;
    }
    if (accepted.length === JOB_DISCOVERY_LIMITS.maxJobsPerRun) break;
  }
  rejectedCount += Math.max(
    0,
    returnedCandidateCount - accepted.length - rejectedCount,
  );
  return { accepted, returnedCandidateCount, rejectedCount, usage };
}
