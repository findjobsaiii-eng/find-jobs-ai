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
      applicationUrl: "https://careers.example.com/jobs/12345/apply",
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

  it("uses ATS JobPosting directApply without requiring visible button text", () => {
    const atsJob = {
      ...job,
      sourceUrl: "https://jobs.lever.co/example/12345678",
      sourceType: "ats" as const,
    };
    const body = `<script type="application/ld+json">${JSON.stringify({
      "@type": "JobPosting",
      title: "Product Manager",
      datePosted: "2026-09-01",
      directApply: true,
    })}</script>Example Company Product Manager`;
    expect(
      classifySourceResponse({
        job: atsJob,
        status: 200,
        finalUrl: atsJob.sourceUrl,
        contentType: "text/html",
        body,
        now: Date.UTC(2026, 8, 9),
      }),
    ).toMatchObject({
      activityStatus: "verified_active",
      activeEvidenceType: "structured_direct_apply",
      datePosted: "2026-09-01T00:00:00.000Z",
      datePostedProvenance: "employer_ats_structured",
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

it("recognizes an explicit Apply link to an opaque primary ATS vacancy", () => {
  const result = classify(200, {
    body: 'Example Company is hiring a Product Manager. <a href="https://jobs.lever.co/example/abcd-1234">Apply</a>',
  });
  expect(result.applicationUrl).toBe("https://jobs.lever.co/example/abcd-1234");
});

it("confirms company identity from an exact ATS tenant when the page omits its client-rendered company label", () => {
  const atsJob = {
    title: "Bookkeeper",
    companyName: "Eon",
    sourceUrl: "https://job-boards.eu.greenhouse.io/eonio/jobs/4862997101",
    sourceType: "ats" as const,
  };
  const classifyTenant = (url: string) =>
    classifySourceResponse({
      job: atsJob,
      status: 200,
      finalUrl: url,
      contentType: "text/html",
      body: "<h1>Bookkeeper</h1><button>Apply for this job</button><p>Requirements: 3–5+ years of bookkeeping experience.</p>",
      now: Date.now(),
    });
  expect(classifyTenant(atsJob.sourceUrl)).toMatchObject({
    identityMatched: true,
    activityStatus: "verified_active",
  });
  expect(
    classifyTenant(atsJob.sourceUrl.replace("eonio", "othercompany")),
  ).toMatchObject({ identityMatched: false, activityStatus: "unknown" });
});

it("accepts an exact ATS brand tenant with a generic company suffix", () => {
  const sourceUrl =
    "https://jobs.lever.co/palantir/c4442730-2926-41ad-8c0e-5e5a6b4d14ae";
  expect(
    classifySourceResponse({
      job: {
        title: "Forward Deployed Software Engineer",
        companyName: "Palantir Technologies",
        sourceUrl,
        sourceType: "ats",
      },
      status: 200,
      finalUrl: sourceUrl,
      contentType: "text/html",
      body: "<h1>Forward Deployed Software Engineer</h1><button>Apply</button>",
      now: Date.now(),
    }),
  ).toMatchObject({ activityStatus: "verified_active", identityMatched: true });
});
it("closes an ATS vacancy redirected to a board error without following another vacancy's Apply link", () => {
  expect(
    classifySourceResponse({
      job: {
        title: "Bookkeeper",
        companyName: "Eon",
        sourceUrl: "https://job-boards.eu.greenhouse.io/eonio/jobs/4862997101",
        sourceType: "ats",
      },
      status: 200,
      finalUrl: "https://job-boards.eu.greenhouse.io/eonio?error=true",
      redirected: true,
      contentType: "text/html",
      body: '<h1>Bookkeeper</h1><a href="/eonio/jobs/4934107101">Apply</a>',
      now: Date.now(),
    }),
  ).toMatchObject({
    activityStatus: "inactive",
    verificationEvidence: "ats_vacancy_removed",
  });
});

it("preserves transport www and trailing slash redirects while still rejecting unsafe targets", async () => {
  const { verificationRequestUrl, isGenericDestination } =
    await import("./jobSourceVerification");
  expect(
    verificationRequestUrl(
      "https://www.drushim.co.il/job/38512167/",
      "https://drushim.co.il/job/38512167",
    ),
  ).toBe("https://www.drushim.co.il/job/38512167/");
  expect(
    verificationRequestUrl("/jobs/company/role/", "https://www.comeet.com"),
  ).toBe("https://www.comeet.com/jobs/company/role/");
  expect(verificationRequestUrl("http://127.0.0.1/private")).toBeNull();
  expect(
    verificationRequestUrl("https://user:password@example.com"),
  ).toBeNull();
  expect(
    isGenericDestination(
      new URL(
        "https://jobify360.co.il/jobs/Computer%20Applications%20Instructor?page=2",
      ),
    ),
  ).toBe(true);
  expect(
    isGenericDestination(
      new URL(
        "https://www.alljobs.co.il/Search/UploadSingle.aspx?JobID=8798119",
      ),
    ),
  ).toBe(false);
});

it("confirms a bilingual employer from its own structured vacancy introduction and retains its description", () => {
  const body = `<h1>Product Manager</h1><script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", title: "Product Manager", hiringOrganization: { name: "חברת דוגמה" }, description: "Example Company is seeking a Product Manager. React experience required.", datePosted: new Date().toISOString() })}</script><button>Apply</button>`;
  expect(classify(200, { body })).toMatchObject({
    activityStatus: "verified_active",
    identityMatched: true,
  });
  expect(classify(200, { body }).rawSourceText).toContain(
    "React experience required.",
  );
});

it("does not assert closure from an unconfirmed structured title/company identity", () => {
  const body = `<script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", title: "Other role", hiringOrganization: { name: "Other employer" }, validThrough: "2099-01-01" })}</script>`;
  expect(classify(200, { body })).toMatchObject({
    activityStatus: "unknown",
    identityMatched: false,
    verificationEvidence: "structured_identity_unconfirmed",
  });
});

it("does not turn Apply Today or a company biography into a publication date", () => {
  const result = classify(200, {
    body: 'Example Company is hiring a Product Manager. Our company was founded 20 years ago. <a href="/jobs/12345/apply">Apply Today</a>',
  });
  expect(result.activityStatus).toBe("verified_active");
  expect(result.datePosted).toBeNull();
  expect(
    classify(200, {
      body: "Example Company Product Manager.<div>2 days ago</div>",
    }).datePosted,
  ).not.toBeNull();
});
