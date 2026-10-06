// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { normalizeVerifiedRequirements } from "./jobRequirementActions";
import { classifyProviderError } from "./jobDiscoveryActions";
import { classifySourceResponse } from "./jobSourceVerification";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const mocks = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock("openai", async (original) => {
  const actual = await original<typeof import("openai")>();
  class Client extends actual.default {
    constructor() {
      super({ apiKey: "test" });
      this.responses.parse = mocks.parse;
    }
  }
  return { ...actual, default: Client };
});
const job = {
  title: "Software Engineer",
  descriptionText: "Build software",
  requirementsText: null,
  requiredExperienceYearsMin: null,
  requiredExperienceYearsMax: null,
  requiredSkills: [],
  preferredSkills: [],
  languages: [],
  educationRequirements: [],
};
const verification = classifySourceResponse({
  job: {
    ...job,
    companyName: "Example",
    sourceUrl: "https://jobs.lever.co/example/1234",
    sourceType: "ats",
  },
  finalUrl: "https://jobs.lever.co/example/1234",
  status: 200,
  contentType: "text/html",
  body: '<h1>Example Software Engineer</h1><h2>Requirements</h2><p>React or Angular experience required.</p><p>Fluent English is required.</p><p>Python is preferred.</p><a href="/example/1234/apply">Apply</a>',
  now: Date.now(),
});
const owner = { userId: "users:test" as Id<"users"> };
const ctx = { runMutation: vi.fn() } as unknown as ActionCtx;
const parsed = {
  complete: true,
  requiredSkills: [
    {
      requirement: "React or Angular",
      evidence: "React or Angular experience required.",
      importance: "required",
    },
  ],
  preferredSkills: [
    {
      requirement: "Python",
      evidence: "Python is preferred.",
      importance: "preferred",
    },
  ],
  educationRequirements: [],
  languages: [
    {
      requirement: "Fluent English",
      evidence: "Fluent English is required.",
      importance: "required",
    },
  ],
  otherRequirements: [],
};
beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test");
  vi.stubEnv("OPENAI_JOB_SEARCH_MODEL", "gpt-test");
  mocks.parse.mockResolvedValue({
    id: "response",
    status: "completed",
    model: "gpt-test",
    output_parsed: parsed,
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it("normalizes source-backed OR/language/preferred conditions once per source content", async () => {
  const facts = await normalizeVerifiedRequirements(
    ctx,
    job,
    verification,
    owner,
  );
  expect(facts).toMatchObject({
    requirementsStatus: "complete",
    requiredSkills: ["React or Angular"],
    preferredSkills: ["Python"],
    languages: ["Fluent English"],
  });
  await normalizeVerifiedRequirements(
    ctx,
    { ...job, ...facts! },
    verification,
    owner,
  );
  expect(mocks.parse).toHaveBeenCalledTimes(1);
});
it("downgrades unsupported quotes and truncated source content instead of inventing confidence", async () => {
  mocks.parse.mockResolvedValue({
    id: "response",
    status: "completed",
    output_parsed: {
      ...parsed,
      requiredSkills: [
        {
          requirement: "React",
          evidence: "This quote is not in the employer posting",
          importance: "required",
        },
      ],
    },
  });
  expect(
    await normalizeVerifiedRequirements(ctx, job, verification, owner),
  ).toMatchObject({ requirementsStatus: "incomplete", requiredSkills: [] });
  mocks.parse.mockResolvedValue({
    id: "response",
    status: "completed",
    output_parsed: parsed,
  });
  expect(
    await normalizeVerifiedRequirements(
      ctx,
      job,
      {
        ...verification,
        rawSourceText: verification.rawSourceText!.padEnd(32000, " "),
      },
      owner,
    ),
  ).toMatchObject({ requirementsStatus: "incomplete" });
});
it("keeps source text usable when normalization fails and does not retry every verification", async () => {
  mocks.parse.mockRejectedValue(new Error("provider unavailable"));
  const facts = await normalizeVerifiedRequirements(
    ctx,
    job,
    verification,
    owner,
  );
  expect(facts?.requirementsStatus).toBe("incomplete");
  expect(facts?.requirementsText).toContain("React or Angular");
  await normalizeVerifiedRequirements(
    ctx,
    { ...job, ...facts! },
    verification,
    owner,
  );
  expect(mocks.parse).toHaveBeenCalledTimes(1);
});
it("distinguishes exhausted provider credits from a transient failure", () => {
  expect(
    classifyProviderError(
      new Error("429 insufficient_quota: exceeded your current quota"),
    ),
  ).toBe("provider_billing");
});

it("rejects changed numeric thresholds or a skill not present in its quoted evidence", async () => {
  for (const requirement of ["100 years of experience", "Kubernetes"]) {
    mocks.parse.mockResolvedValue({
      id: "response",
      status: "completed",
      output_parsed: {
        ...parsed,
        requiredSkills: [
          {
            requirement,
            evidence: "React or Angular experience required.",
            importance: "required",
          },
        ],
      },
    });
    expect(
      await normalizeVerifiedRequirements(ctx, job, verification, owner),
    ).toMatchObject({ requirementsStatus: "incomplete", requiredSkills: [] });
  }
});

it("retains the original stack for non-SDK discovery failures", async () => {
  const { providerFailureDiagnostics } = await import("./jobDiscoveryActions");
  const failure = new Error("Example pipeline validation failure");
  expect(providerFailureDiagnostics(failure)).toMatchObject({
    errorCode: "Error",
    responseStatus: "pipeline_exception",
    parsed: false,
  });
  expect(providerFailureDiagnostics(failure)?.errorMessage).toContain(
    failure.stack!,
  );
});
