/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import { estimateOpenAiUsd } from "./aiUsageModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

it("attributes metered calls without double-counting stored search totals", async () => {
  const t = convexTest(schema, modules);
  const now = Date.now();
  const { adminId, userId, runId } = await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", {
      email: "admin@example.com",
    });
    const userId = await ctx.db.insert("users", {
      email: "candidate@example.com",
    });
    await ctx.db.insert("adminMemberships", {
      userId: adminId,
      role: "admin",
      active: true,
      grantedBy: "test",
      createdAt: now,
      updatedAt: now,
    });
    const queryId = await ctx.db.insert("jobSearchQueries", {
      fingerprint: "test-query",
      normalizedCriteria: "test",
      generatedQueries: ["test"],
      createdAt: now,
    });
    const runId = await ctx.db.insert("jobSearchRuns", {
      userId,
      queryId,
      fingerprint: "test-query",
      status: "completed",
      provider: "openai",
      model: "gpt-5.6-luna",
      startedAt: now,
      completedAt: now,
      usage: { inputTokens: 9_999, outputTokens: 9_999, totalTokens: 19_998 },
      returnedCandidateCount: 1,
      acceptedCount: 1,
      rejectedCount: 0,
      insertedCount: 1,
      deduplicatedCount: 0,
    });
    await ctx.db.insert("jobSearchRuns", {
      userId,
      queryId,
      fingerprint: "older-query",
      status: "completed",
      provider: "openai",
      model: "gpt-5.6-luna",
      startedAt: now - 500,
      completedAt: now - 400,
      usage: { inputTokens: 30, outputTokens: 10, totalTokens: 40 },
      webSearchToolCallCount: 1,
      returnedCandidateCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      insertedCount: 0,
      deduplicatedCount: 0,
    });
    return { adminId, userId, runId };
  });
  const searchUsage = {
    userId,
    operation: "job_search" as const,
    model: "gpt-5.6-luna",
    searchRunId: runId,
    inputTokens: 100,
    cachedInputTokens: 20,
    outputTokens: 50,
    totalTokens: 150,
    webSearchCalls: 1,
  };
  await t.mutation(internal.aiUsage.recordResponse, {
    responseId: "resp_search_1",
    ...searchUsage,
  });
  await t.mutation(internal.aiUsage.recordResponse, {
    responseId: "resp_search_1",
    ...searchUsage,
  });
  await t.mutation(internal.aiUsage.recordResponse, {
    responseId: "resp_search_retry",
    ...searchUsage,
    inputTokens: 80,
    outputTokens: 20,
    totalTokens: 100,
  });
  await t.mutation(internal.aiUsage.recordResponse, {
    responseId: "resp_review",
    userId,
    operation: "deep_review",
    model: "gpt-5.6-luna",
    inputTokens: 1_000,
    cachedInputTokens: 0,
    outputTokens: 100,
    totalTokens: 1_100,
    webSearchCalls: 2,
  });
  await t.mutation(internal.aiUsage.recordResponse, {
    responseId: "resp_cv",
    userId,
    operation: "resume_extraction",
    model: "unknown-model",
    inputTokens: 200,
    cachedInputTokens: 0,
    outputTokens: 100,
    totalTokens: 300,
    webSearchCalls: 0,
  });
  const admin = t.withIdentity({
    subject: `${adminId}|test-session`,
    issuer: "https://test.example",
    tokenIdentifier: `https://test.example|${adminId}`,
  });
  const report = await admin.query(api.admin.tokenUsage, {
    start: now - 1_000,
    end: now + 10_000,
  });
  expect(report.rows).toHaveLength(4);
  expect(
    report.totals.find((total) => total.operation === "job_search"),
  ).toMatchObject({
    operation: "job_search",
    requests: 3,
    inputTokens: 210,
    outputTokens: 80,
    webSearchCalls: 3,
  });
  expect(
    report.totals.find((total) => total.operation === "deep_review"),
  ).toMatchObject({
    operation: "deep_review",
    requests: 1,
    webSearchCalls: 2,
  });
  expect(
    report.totals.find((total) => total.operation === "resume_extraction"),
  ).toMatchObject({
    operation: "resume_extraction",
    unpricedRequests: 1,
  });
  expect(report.rows.filter((row) => row.operation === "job_search")).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ historicalSearch: false, requestCount: 2 }),
      expect.objectContaining({ historicalSearch: true, requestCount: 1 }),
    ]),
  );
  const ordinary = t.withIdentity({
    subject: `${userId}|test-session`,
    issuer: "https://test.example",
    tokenIdentifier: `https://test.example|${userId}`,
  });
  await expect(
    ordinary.query(api.admin.tokenUsage, {
      start: now - 1_000,
      end: now + 10_000,
    }),
  ).rejects.toThrow(/ADMIN_REQUIRED/u);
});

it("estimates model and web-search charges, including cached input", () => {
  expect(
    estimateOpenAiUsd({
      model: "gpt-5.6-luna",
      inputTokens: 1_000,
      cachedInputTokens: 400,
      outputTokens: 500,
      webSearchCalls: 2,
    }),
  ).toBeCloseTo(0.020728, 6);
  expect(
    estimateOpenAiUsd({
      model: "unpriced-model",
      inputTokens: 1_000,
      cachedInputTokens: 0,
      outputTokens: 500,
      webSearchCalls: 2,
    }),
  ).toBeNull();
});
