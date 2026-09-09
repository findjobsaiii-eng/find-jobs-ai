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
  let returnedCandidateCount = 0;
  let rejectedCount = 0;
  const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  let webSearchToolCallCount = 0;
  for (const searchQuery of generatedQueries.slice(
    0,
    Math.min(limits.maxQueries, JOB_DISCOVERY_LIMITS.maxQueries),
  )) {
    const response = await client.responses.parse({
      model,
      store: false,
      max_output_tokens: Math.min(
        limits.maxOutputTokens,
        JOB_DISCOVERY_LIMITS.absoluteMaxOutputTokens,
      ),
      max_tool_calls: 2,
      include: ["web_search_call.action.sources"],
      tools: [{ type: "web_search", search_context_size: "low" }],
      input: [
        {
          role: "system",
          content:
            "Find current, specific Israeli job-posting pages matching the role query. Within this single request, use one search pass for direct employer career and public ATS sources, including Comeet, Greenhouse, Lever, Workday, Workable, SmartRecruiters, Ashby, SAP SuccessFactors, iCIMS, and Oracle Recruiting, and another pass for Jobify, Drushim, JobMaster, AllJobs, LinkedIn Jobs, Indeed Israel, and reputable Israeli recruiting agencies. Return useful matches from either pass; a result set does not need to contain every source family. Prefer a direct employer or ATS URL as sourceUrl. If the same vacancy appears elsewhere, include every exact job URL in sourceEvidence so they attach to one canonical job. Avoid more than four results from one domain when alternatives exist. Favor recently posted listings, but retain older listings with explicit current evidence for deterministic verification. Prefer exact job pages over homepages, search pages, tracking redirects, and aggregators. Never invent facts or URLs. Use null or empty arrays when a source does not state a field. Salary is null unless explicitly stated. Work-authorization requirements are null unless explicitly stated. Every job URL and evidence URL must come from web search sources. Aim for 4-10 genuine relevant jobs across diverse domains; return fewer when insufficient evidence exists. Never fabricate to fill the target. Return at most 10 jobs.",
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
    const provider = collectProviderSourceUrls(response.output);
    webSearchToolCallCount += provider.webSearchToolCallCount;
    const candidates = response.output_parsed?.jobs ?? [];
    returnedCandidateCount += candidates.length;
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
    returnedCandidateCount,
    rejectedCount,
    usage,
    webSearchToolCallCount,
  };
}
