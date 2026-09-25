import type OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import { searchJobsWithOpenAI } from "./openAIJobProvider";

describe("OpenAI job provider boundary", () => {
  it("uses bounded web search and rejects jobs without provider URL evidence", async () => {
    const citedUrl = "https://careers.example.com/jobs/123";
    const baseJob = {
      title: "Product Engineer",
      companyName: "Example",
      sourceName: "Example Careers",
      sourceType: "employer",
      descriptionText: null,
      requirementsText: null,
      responsibilities: [],
      requiredSkills: [],
      preferredSkills: [],
      requiredExperienceYearsMin: null,
      requiredExperienceYearsMax: null,
      educationRequirements: [],
      languages: [],
      country: "Israel",
      city: "Tel Aviv",
      locationText: "Tel Aviv, Israel",
      workArrangement: "hybrid",
      employmentType: "full-time",
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      salaryPeriod: null,
      postedAt: null,
      applicationDeadline: null,
      workAuthorizationRequirements: null,
    };
    const parse = vi.fn().mockResolvedValue({
      output: [
        {
          type: "web_search_call",
          action: { type: "search", sources: [{ type: "url", url: citedUrl }] },
        },
      ],
      output_parsed: {
        jobs: [
          {
            ...baseJob,
            sourceUrl: citedUrl,
            sourceEvidence: [{ url: citedUrl, title: null, excerpt: null }],
          },
          {
            ...baseJob,
            sourceUrl: "https://invented.example/jobs/999",
            sourceEvidence: [],
          },
        ],
      },
      usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
    });
    const client = { responses: { parse } } as unknown as OpenAI;
    const result = await searchJobsWithOpenAI(client, "test-model", ["query"], {
      maxQueries: 1,
      maxAcceptedJobs: 5,
      maxOutputTokens: 2_000,
    });
    expect(result.accepted).toHaveLength(1);
    expect(result.candidateUrls).toEqual([
      citedUrl,
      "https://invented.example/jobs/999",
    ]);
    expect(result.rejectedCount).toBe(1);
    expect(result.usage).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    });
    expect(result.webSearchToolCallCount).toBe(1);
    expect(result.diagnostics).toMatchObject({
      responseStatus: "unknown",
      parsed: true,
    });
    expect(parse).toHaveBeenCalledWith(
      expect.objectContaining({
        store: false,
        max_output_tokens: 2_000,
        max_tool_calls: 4,
        tools: [{ type: "web_search", search_context_size: "medium" }],
      }),
    );
  });

  it("fails loudly and preserves bounded diagnostics when structured output is missing", async () => {
    const parse = vi.fn().mockResolvedValue({
      id: "resp_incomplete",
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      error: null,
      output_text: "partial output",
      output: [{ type: "reasoning", summary: [] }],
      output_parsed: null,
      usage: { input_tokens: 100, output_tokens: 2_000, total_tokens: 2_100 },
    });
    const client = { responses: { parse } } as unknown as OpenAI;

    await expect(
      searchJobsWithOpenAI(client, "test-model", ["query"], {
        maxQueries: 1,
        maxAcceptedJobs: 5,
        maxOutputTokens: 2_000,
      }),
    ).rejects.toMatchObject({
      name: "JobSearchProviderResponseError",
      diagnostics: {
        responseId: "resp_incomplete",
        responseStatus: "incomplete",
        parsed: false,
        incompleteReason: "max_output_tokens",
        outputTextExcerpt: "partial output",
      },
    });
    expect(parse).toHaveBeenCalledTimes(2);
    expect(parse.mock.calls[1]?.[0]).toMatchObject({
      max_tool_calls: 3,
      tools: [{ type: "web_search", search_context_size: "low" }],
    });
  });

  it("recovers from token exhaustion with a compact retry", async () => {
    const parse = vi
      .fn()
      .mockResolvedValueOnce({
        id: "resp_incomplete",
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        error: null,
        output_text: "partial output",
        output: [],
        output_parsed: null,
        usage: { input_tokens: 100, output_tokens: 2_000, total_tokens: 2_100 },
      })
      .mockResolvedValueOnce({
        id: "resp_complete",
        status: "completed",
        incomplete_details: null,
        error: null,
        output: [],
        output_parsed: { jobs: [] },
        usage: { input_tokens: 80, output_tokens: 100, total_tokens: 180 },
      });
    const client = { responses: { parse } } as unknown as OpenAI;

    const result = await searchJobsWithOpenAI(client, "test-model", ["query"], {
      maxQueries: 1,
      maxAcceptedJobs: 5,
      maxOutputTokens: 2_000,
    });

    expect(parse).toHaveBeenCalledTimes(2);
    expect(parse.mock.calls[1]?.[0]).toMatchObject({
      max_tool_calls: 3,
      tools: [{ type: "web_search", search_context_size: "low" }],
    });
    expect(parse.mock.calls[1]?.[0].input[0].content).toContain(
      "Return at most 3 useful candidates",
    );
    expect(result.usage).toEqual({
      inputTokens: 180,
      outputTokens: 2_100,
      totalTokens: 2_280,
    });
    expect(result.diagnostics).toMatchObject({
      responseId: "resp_complete",
      responseStatus: "completed",
      parsed: true,
    });
  });
});
