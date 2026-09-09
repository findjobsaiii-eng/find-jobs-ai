import { describe, expect, it } from "vitest";
import {
  classifySourceFailure,
  classifySourceResponse,
} from "./jobSourceVerification";

const job = {
  title: "Product Manager",
  companyName: "Example Company",
  sourceUrl: "https://careers.example.com/jobs/12345",
  sourceType: "employer" as const,
};

function classify(
  status: number,
  options: { body?: string; finalUrl?: string; redirected?: boolean } = {},
) {
  return classifySourceResponse({
    job,
    status,
    finalUrl: options.finalUrl ?? job.sourceUrl,
    contentType: "text/html",
    body:
      options.body ??
      "Example Company is hiring a Product Manager. Apply for this job.",
    redirected: options.redirected,
    now: 100,
  });
}

describe("deterministic source activity classification", () => {
  it("confirms a specific active page", () => {
    expect(classify(200).activityStatus).toBe("verified_active");
  });

  it("records matching valid JobPosting evidence", () => {
    const body = `<script type="application/ld+json">${JSON.stringify({
      "@type": "JobPosting",
      title: "Product Manager",
      hiringOrganization: { name: "Example Company" },
      validThrough: "2099-01-01T00:00:00Z",
    })}</script>Example Company Product Manager`;
    expect(classify(200, { body })).toMatchObject({
      activityStatus: "verified_active",
      verificationEvidence: "Structured JobPosting valid; HTTP 2xx",
    });
  });

  it.each([404, 410])("closes HTTP %s listings", (status) => {
    expect(classify(status)).toMatchObject({
      activityStatus: "inactive",
      verificationEvidence: `HTTP ${status}`,
    });
  });

  it.each([
    "This job is no longer available",
    "Applications are closed",
    "המשרה אינה בתוקף",
    "הגשת המועמדות הסתיימה",
  ])("closes pages with an explicit marker: %s", (marker) => {
    expect(classify(200, { body: marker }).activityStatus).toBe("inactive");
  });

  it("closes a redirect to a generic careers page", () => {
    expect(
      classify(200, {
        finalUrl: "https://careers.example.com/careers",
        body: "Browse our current vacancies",
        redirected: true,
      }),
    ).toMatchObject({
      activityStatus: "inactive",
      verificationEvidence: "Redirected to generic careers page",
    });
  });

  it.each([403, 429, 500, 503])("treats HTTP %s as temporary", (status) => {
    expect(classify(status).activityStatus).toBe("verification_failed");
  });

  it("treats a timeout as temporary", () => {
    expect(classifySourceFailure(job, "request_timeout")).toMatchObject({
      activityStatus: "verification_failed",
      verificationEvidence: "Verification failed: request_timeout",
    });
  });
});

it("preserves a canonical redirect with a query job ID", () => {
  expect(
    classify(200, {
      finalUrl: "https://careers.example.com/?gh_jid=12345",
      redirected: true,
    }).activityStatus,
  ).toBe("verified_active");
});
it("does not close a login redirect", () => {
  expect(
    classify(200, {
      finalUrl: "https://careers.example.com/login",
      body: "Sign in",
      redirected: true,
    }).activityStatus,
  ).toBe("verification_failed");
});
