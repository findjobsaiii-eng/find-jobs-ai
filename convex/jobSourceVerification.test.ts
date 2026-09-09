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
      'Example Company is hiring a Product Manager. <a href="/jobs/12345/apply">Apply for this job</a>.',
    redirected: options.redirected,
    now: 100,
  });
}

describe("deterministic source activity classification", () => {
  it("confirms a specific active page", () => {
    expect(classify(200)).toMatchObject({
      activityStatus: "verified_active",
      activeEvidenceType: "active_application_flow",
      identityMatched: true,
      applicationAvailable: true,
    });
  });

  it("accepts an employer listing with an explicit email application path", () => {
    expect(
      classify(200, {
        body: "Example Company Product Manager. To apply for this position please email your CV to careers@example.com.",
      }),
    ).toMatchObject({
      activityStatus: "verified_active",
      activeEvidenceType: "active_application_flow",
      identityMatched: true,
      applicationAvailable: true,
    });
  });

  it("does not treat HTTP 200 and matching identity alone as active", () => {
    expect(
      classify(200, {
        body: "Example Company is hiring a Product Manager.",
      }),
    ).toMatchObject({
      activityStatus: "unknown",
      verificationEvidence: "undated_listing_http_only",
    });
  });

  it("accepts a matching page with a recent deterministic posting date", () => {
    expect(
      classify(200, {
        body: "Example Company Product Manager posted 2 days ago",
      }),
    ).toMatchObject({
      activityStatus: "verified_active",
      activeEvidenceType: "recent_page_date",
    });
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
      verificationEvidence: "structured_valid_through_future",
    });
  });

  it("expires matching structured postings after validThrough", () => {
    const body = `<script type="application/ld+json">${JSON.stringify({
      "@type": "JobPosting",
      title: "Product Manager",
      hiringOrganization: { name: "Example Company" },
      validThrough: "1970-01-01T00:00:00Z",
    })}</script>Example Company Product Manager`;
    expect(classify(200, { body })).toMatchObject({
      activityStatus: "inactive",
      verificationEvidence: "structured_valid_through_expired",
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
    "כבר לא מקבלים בקשות",
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

  it("rejects a page whose job identifier changed", () => {
    expect(
      classify(200, {
        finalUrl: "https://careers.example.com/jobs/99999",
      }),
    ).toMatchObject({
      activityStatus: "inactive",
      verificationEvidence: "job_identity_replaced",
    });
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
