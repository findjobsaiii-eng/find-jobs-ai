"use node";

import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import type { IncomingHttpHeaders } from "node:http";
import type { NormalizedJob } from "./jobDiscoveryModel";
import { normalizePublicUrl } from "./jobDiscoveryModel";
import { classifyJobSource } from "./jobSourceQuality";
import type { DatePostedProvenance } from "./jobFreshness";

const REQUEST_TIMEOUT_MS = 8_000;
const DNS_TIMEOUT_MS = 3_000;
const MAX_REDIRECTS = 3;
const MAX_RESPONSE_BYTES = 512 * 1_024;

export type SourceVerification = {
  activityStatus:
    "verified_active" | "unknown" | "inactive" | "verification_failed";
  finalUrl: string | null;
  domain: string;
  sourceTier: "employer" | "ats" | "job_board" | "aggregator";
  externalJobId: string | null;
  verifiedAt: number;
  verificationMethod: "http_content_v2";
  verificationEvidence: string;
  activeEvidenceType: string | null;
  identityMatched: boolean;
  applicationAvailable: boolean;
  applicationUrl?: string | null;
  structuredDatePosted: string | null;
  datePosted?: string | null;
  datePostedProvenance?: DatePostedProvenance | null;
  structuredValidThrough: string | null;
  structuredJobIdentifier: string | null;
  pageTitle: string | null;
  redirected: boolean;
  rawSourceText?: string;
  httpStatus?: number;
};

export type VerifiableJob = Pick<
  NormalizedJob,
  "title" | "companyName" | "sourceUrl" | "sourceType"
>;

const SHARED_RATE_LIMIT_DOMAINS = [
  "comeet.co",
  "comeet.com",
  "greenhouse.io",
  "lever.co",
  "myworkdayjobs.com",
  "smartrecruiters.com",
  "ashbyhq.com",
  "recruitee.com",
  "workable.com",
  "successfactors.com",
  "icims.com",
  "oraclecloud.com",
  "dayforcehcm.com",
  "drushim.co.il",
  "jobmaster.co.il",
  "alljobs.co.il",
  "jobify360.co.il",
  "linkedin.com",
  "indeed.com",
] as const;

function domainMatches(hostname: string, domain: string) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return true;
  }
  const [a, b, c] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isPrivateAddress(address: string) {
  const normalized = address.toLocaleLowerCase("en-US").split("%")[0];
  const version = isIP(normalized);
  if (version === 4) return isPrivateIpv4(normalized);
  if (version !== 6) return true;

  // Only routable global-unicast IPv6 addresses are valid fetch targets.
  // This conservative allowlist also excludes IPv4-mapped, multicast,
  // link-local, unique-local, documentation, benchmarking, Teredo, and 6to4
  // ranges that can otherwise obscure an internal destination.
  const firstHextet = Number.parseInt(normalized.split(":")[0] ?? "", 16);
  if (
    !Number.isInteger(firstHextet) ||
    firstHextet < 0x2000 ||
    firstHextet > 0x3fff
  ) {
    return true;
  }
  return (
    normalized === "2001::" ||
    normalized.startsWith("2001:0:") ||
    normalized.startsWith("2001:2:") ||
    /^2001:2[0-9a-f]:/u.test(normalized) ||
    /^2001:db8:/u.test(normalized) ||
    /^2002:/u.test(normalized)
  );
}

async function resolvePublicHost(url: URL) {
  const standardPort =
    !url.port ||
    (url.protocol === "http:" && url.port === "80") ||
    (url.protocol === "https:" && url.port === "443");
  if (
    !url.hostname ||
    url.username ||
    url.password ||
    !["http:", "https:"].includes(url.protocol) ||
    !standardPort
  ) {
    throw new Error("unsafe_url");
  }
  if (isIP(url.hostname)) {
    if (isPrivateAddress(url.hostname)) throw new Error("private_address");
    return { address: url.hostname, family: isIP(url.hostname) as 4 | 6 };
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    lookup(url.hostname, { all: true, verbatim: true }),
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("dns_timeout")),
        DNS_TIMEOUT_MS,
      );
    }),
  ]).finally(() => clearTimeout(timer));
  if (
    !addresses.length ||
    addresses.some(({ address }) => isPrivateAddress(address))
  ) {
    throw new Error("private_address");
  }
  return addresses[0];
}

type PinnedResponse = {
  status: number;
  headers: IncomingHttpHeaders;
  text: string;
};

async function requestPinned(url: URL): Promise<PinnedResponse> {
  const target = await resolvePublicHost(url);
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const timer = setTimeout(() => {
      req.destroy(new Error("request_timeout"));
    }, REQUEST_TIMEOUT_MS);
    const req = request(
      {
        protocol: url.protocol,
        hostname: target.address,
        family: target.family,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        servername: url.protocol === "https:" ? url.hostname : undefined,
        headers: {
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.8",
          "Accept-Encoding": "identity",
          Host: url.host,
          "User-Agent": "WorkyJobVerifier/1.0",
        },
      },
      (response) => {
        const declaredLength = Number(response.headers["content-length"]);
        if (
          Number.isFinite(declaredLength) &&
          declaredLength > MAX_RESPONSE_BYTES
        ) {
          response.destroy(new Error("response_too_large"));
          return;
        }
        response.on("data", (chunk: Buffer) => {
          size += chunk.byteLength;
          if (size > MAX_RESPONSE_BYTES) {
            response.destroy(new Error("response_too_large"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          clearTimeout(timer);
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            text: Buffer.concat(chunks).toString("utf8"),
          });
        });
        response.on("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
      },
    );
    req.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    req.end();
  });
}

export function visibleText(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&(nbsp|amp|quot|#39|lt|gt);/giu, " ")
    .normalize("NFKC")
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 120_000);
}

function significantTokens(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .split(/[^\p{L}\p{N}+#.]+/u)
    .filter((token) => token.length >= 3);
}

function expectedEntityPresent(text: string, value: string) {
  const haystack = text.toLocaleLowerCase("en-US");
  const expected = significantTokens(value);
  if (!expected.length) return false;
  const matches = expected.filter((token) => haystack.includes(token)).length;
  return matches >= Math.min(2, expected.length);
}

export function isGenericDestination(url: URL) {
  const path = url.pathname
    .replace(/^\/+|\/+$/gu, "")
    .toLocaleLowerCase("en-US");
  if (externalJobId(url)) return false;
  if (!path) return true;
  const segments = path.split("/");
  if (
    /^(login|signin|search|home)$/u.test(segments[segments.length - 1] ?? "")
  ) {
    return true;
  }
  if (
    segments.length === 1 &&
    /^(career|careers|job|jobs|vacancies)$/u.test(path)
  ) {
    return true;
  }
  return false;
}

function sourceTier(
  job: VerifiableJob,
  hostname: string,
): SourceVerification["sourceTier"] {
  return classifyJobSource(hostname, job.sourceType).sourceTier;
}

function externalJobId(url: URL) {
  for (const key of ["gh_jid", "jobId", "job_id", "jid"]) {
    const value = url.searchParams.get(key)?.trim();
    if (value && /^[\w-]{4,100}$/u.test(value)) return value;
  }
  const candidates = url.pathname.split("/").filter(Boolean).reverse();
  return (
    candidates
      .find(
        (part) =>
          /\d{5,}/u.test(part) || /^[0-9a-f]{8}-[0-9a-f-]{20,}$/iu.test(part),
      )
      ?.slice(0, 120) ?? null
  );
}

function failure(
  job: VerifiableJob,
  activityStatus: "inactive" | "verification_failed",
  evidence: string,
  finalUrl?: string,
): SourceVerification {
  const parsed = new URL(finalUrl ?? job.sourceUrl);
  return {
    activityStatus,
    finalUrl: finalUrl ?? null,
    domain: parsed.hostname.toLocaleLowerCase("en-US"),
    sourceTier: sourceTier(job, parsed.hostname.toLocaleLowerCase("en-US")),
    externalJobId: externalJobId(parsed),
    verifiedAt: Date.now(),
    verificationMethod: "http_content_v2",
    verificationEvidence: evidence.slice(0, 240),
    activeEvidenceType: null,
    identityMatched: false,
    applicationAvailable: false,
    structuredDatePosted: null,
    datePosted: null,
    datePostedProvenance: null,
    structuredValidThrough: null,
    structuredJobIdentifier: null,
    pageTitle: null,
    redirected: false,
  };
}

export function classifySourceFailure(
  job: VerifiableJob,
  category: string,
  finalUrl?: string,
) {
  return failure(
    job,
    "verification_failed",
    `Verification failed: ${category}`,
    finalUrl,
  );
}

const CLOSED_POSITION_PATTERN =
  /(?:this\s+)?(?:position|job|vacancy|role|opportunity) (?:has been |has |is )?(?:closed|filled|expired|removed|no longer available)|applications? (?:are )?closed|no longer accepting applications|vacancy closed|position filled|המשרה (?:כבר )?(?:אינה זמינה|לא זמינה|נסגרה|אינה בתוקף|אוישה|פגה)|הגשת המועמדות הסתיימה|לא ניתן עוד להגיש מועמדות|כבר לא מקבלים בקשות/iu;

const RECENT_POSTING_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000;

function primaryPostingText(text: string) {
  return text.split(
    /(?:similar jobs|people also viewed|עבודות דומות|אנשים צפו גם)/iu,
    1,
  )[0];
}

function primaryPostingHtml(html: string) {
  return html.split(
    /(?:similar jobs|people also viewed|עבודות דומות|אנשים צפו גם)/iu,
    1,
  )[0];
}

function pageTitle(html: string) {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu);
  return match ? visibleText(match[1]).slice(0, 300) : null;
}

function parseTimestamp(value: string | null) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function relativePostedAt(text: string, now: number) {
  const normalized = text.toLocaleLowerCase("en-US");
  if (
    /\b(?:posted\s+)?today\b/u.test(normalized) ||
    /(?:^|\s)היום(?:\s|$)/u.test(normalized)
  ) {
    return now;
  }
  if (
    /\b(?:posted\s+)?yesterday\b/u.test(normalized) ||
    /(?:^|\s)אתמול(?:\s|$)/u.test(normalized)
  ) {
    return now - 24 * 60 * 60 * 1_000;
  }
  const english = normalized.match(
    /(?:posted\s+)?(\d{1,3})\s+(minute|hour|day|week|month|year)s?\s+ago/u,
  );
  const hebrew = normalized.match(
    /לפני\s+(\d{1,3})\s+(דקות?|שעות?|ימים?|שבועות?|חודשים?|שנים?)/u,
  );
  const match = english ?? hebrew;
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2];
  const unitDays = /minute|דק/u.test(unit)
    ? 1 / 1440
    : /hour|שע/u.test(unit)
      ? 1 / 24
      : /day|יום|ימים/u.test(unit)
        ? 1
        : /week|שבוע/u.test(unit)
          ? 7
          : /month|חודש/u.test(unit)
            ? 30
            : 365;
  return now - amount * unitDays * 24 * 60 * 60 * 1_000;
}

function jobPostingIdentifier(data: Record<string, unknown>) {
  if (typeof data.identifier === "string") return data.identifier.slice(0, 200);
  if (data.identifier && typeof data.identifier === "object") {
    const identifier = data.identifier as Record<string, unknown>;
    const value = identifier.value ?? identifier.name;
    if (typeof value === "string") return value.slice(0, 200);
  }
  return null;
}

function hasApplicationAction(html: string) {
  if (/"directApply"\s*:\s*true/iu.test(html)) return true;
  if (/data-tracking-control-name=["'][^"']*apply[^"']*["']/iu.test(html)) {
    return true;
  }
  if (
    /<(?:button|input)\b[^>]*(?:type=["']submit["']|data-(?:qa|automation-id)=["'][^"']*apply)[^>]*>/iu.test(
      html,
    ) &&
    /(?:apply|submit application|הגש(?:ת)? מועמדות)/iu.test(visibleText(html))
  ) {
    return true;
  }
  for (const link of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/giu)) {
    const attributes = link[1];
    const label = visibleText(link[2]);
    const href = attributes.match(/href=["']([^"']+)["']/iu)?.[1] ?? "";
    if (
      /(?:apply|application|candidate|מועמדות)/iu.test(href) &&
      /(?:apply|submit|application|הגש|מועמדות)/iu.test(
        `${label} ${attributes}`,
      )
    ) {
      return true;
    }
  }
  const text = visibleText(html);
  if (
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu.test(text) &&
    /(?:to\s+apply[\s\S]{0,120}(?:email|send)[\s\S]{0,80}(?:cv|resume|application)|(?:email|send)[\s\S]{0,80}(?:your\s+)?(?:cv|resume|application)[\s\S]{0,120}(?:to|at)|(?:להגשת\s+מועמדות|להגשת\s+המועמדות|שלחו?|נא\s+לשלוח)[\s\S]{0,100}(?:קורות\s+חיים|מועמדות|דוא["״']?ל|מייל))/iu.test(
      text,
    )
  ) {
    return true;
  }
  return /<form\b[^>]*(?:action=["'][^"']*(?:apply|application|candidate)[^"']*["']|data-[^>]*(?:apply|application))/iu.test(
    html,
  );
}

function applicationUrl(html: string, baseUrl: string) {
  for (const link of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/giu)) {
    const attributes = link[1];
    const label = visibleText(link[2]);
    const href = attributes.match(/href=["']([^"']+)["']/iu)?.[1] ?? "";
    if (
      !/(?:apply|application|candidate|מועמדות)/iu.test(href) ||
      !/(?:apply|submit|application|הגש|מועמדות)/iu.test(
        `${label} ${attributes}`,
      )
    ) {
      continue;
    }
    try {
      const normalized = normalizePublicUrl(new URL(href, baseUrl).toString());
      if (normalized) return normalized;
    } catch {
      // A malformed action URL is not a usable application destination.
    }
  }
  return null;
}

export function verificationRateLimitKey(sourceUrl: string) {
  try {
    const hostname = new URL(sourceUrl).hostname.toLocaleLowerCase("en-US");
    const sharedDomain = SHARED_RATE_LIMIT_DOMAINS.find((domain) =>
      domainMatches(hostname, domain),
    );
    return sharedDomain ?? hostname;
  } catch {
    return sourceUrl;
  }
}

type StructuredPosting = {
  matched: boolean;
  anyPosting: boolean;
  datePosted: string | null;
  validThrough: string | null;
  identifier: string | null;
  directApply: boolean;
};

function structuredPosting(
  html: string,
  job: VerifiableJob,
  allowPageCompanyFallback: boolean,
): StructuredPosting {
  const result: StructuredPosting = {
    matched: false,
    anyPosting: false,
    datePosted: null,
    validThrough: null,
    identifier: null,
    directApply: false,
  };
  for (const script of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu,
  )) {
    try {
      const queue: unknown[] = [JSON.parse(script[1])];
      for (let i = 0; i < queue.length && i < 100; i += 1) {
        const item = queue[i];
        if (Array.isArray(item)) {
          queue.push(...item.slice(0, 100));
          continue;
        }
        if (!item || typeof item !== "object") continue;
        const data = item as Record<string, unknown>;
        if (data["@graph"]) queue.push(data["@graph"]);
        const types = Array.isArray(data["@type"])
          ? data["@type"]
          : [data["@type"]];
        if (!types.includes("JobPosting")) continue;
        result.anyPosting = true;
        const organization = data.hiringOrganization as
          Record<string, unknown> | undefined;
        const titleMatched =
          typeof data.title === "string" &&
          expectedEntityPresent(data.title, job.title);
        const companyMatched =
          typeof organization?.name === "string" &&
          expectedEntityPresent(organization.name, job.companyName);
        const pageCompanyMatched = expectedEntityPresent(
          visibleText(html),
          job.companyName,
        );
        if (
          !titleMatched ||
          (!companyMatched && !(allowPageCompanyFallback && pageCompanyMatched))
        ) {
          continue;
        }
        result.matched = true;
        result.datePosted =
          typeof data.datePosted === "string" ? data.datePosted : null;
        result.validThrough =
          typeof data.validThrough === "string" ? data.validThrough : null;
        result.identifier = jobPostingIdentifier(data);
        result.directApply = data.directApply === true;
        return result;
      }
    } catch {
      // Malformed JSON-LD is missing evidence, not closure evidence.
    }
  }
  return result;
}

export function classifySourceResponse(args: {
  job: VerifiableJob;
  status: number;
  finalUrl: string;
  contentType?: string;
  body?: string;
  redirected?: boolean;
  now?: number;
}): SourceVerification {
  const normalizedUrl = normalizePublicUrl(args.finalUrl);
  const parsed = new URL(normalizedUrl ?? args.job.sourceUrl);
  const hostname = parsed.hostname.toLocaleLowerCase("en-US");
  const common = {
    finalUrl: normalizedUrl,
    domain: hostname,
    sourceTier: sourceTier(args.job, hostname),
    externalJobId: externalJobId(parsed),
    verifiedAt: args.now ?? Date.now(),
    httpStatus: args.status,
    verificationMethod: "http_content_v2" as const,
    activeEvidenceType: null,
    identityMatched: false,
    applicationAvailable: false,
    structuredDatePosted: null,
    datePosted: null,
    datePostedProvenance: null,
    structuredValidThrough: null,
    structuredJobIdentifier: null,
    pageTitle: pageTitle(args.body ?? ""),
    redirected: args.redirected ?? false,
  };
  if (args.status === 404 || args.status === 410) {
    return {
      ...common,
      activityStatus: "inactive",
      verificationEvidence: `HTTP ${args.status}`,
    };
  }
  if (args.status === 429 || args.status >= 500 || args.status < 200) {
    return {
      ...common,
      activityStatus: "verification_failed",
      verificationEvidence: `Temporary HTTP ${args.status}`,
    };
  }
  if (args.status < 200 || args.status >= 300) {
    return {
      ...common,
      activityStatus: "verification_failed",
      verificationEvidence: `HTTP ${args.status}`,
    };
  }
  if (
    !/(text\/html|application\/xhtml\+xml|text\/plain)/iu.test(
      args.contentType ?? "",
    )
  ) {
    return {
      ...common,
      activityStatus: "verification_failed",
      verificationEvidence: "Unsupported response type",
    };
  }
  if (!normalizedUrl) {
    return {
      ...common,
      activityStatus: "verification_failed",
      verificationEvidence: "Unsafe final URL",
    };
  }
  const text = visibleText(args.body ?? "");
  const primaryText = primaryPostingText(text);
  if (
    /\b(?:sign in|log in|captcha|access denied|verify you are human|just a moment)\b/iu.test(
      text,
    ) &&
    !expectedEntityPresent(primaryText, args.job.title)
  ) {
    return {
      ...common,
      activityStatus: "verification_failed",
      verificationEvidence: "Authentication or bot challenge",
    };
  }
  if (
    args.redirected &&
    isGenericDestination(parsed) &&
    !/\/(?:login|signin)(?:\/|$)/iu.test(parsed.pathname) &&
    !expectedEntityPresent(primaryText, args.job.title)
  ) {
    return {
      ...common,
      activityStatus: "inactive",
      verificationEvidence: "Redirected to generic careers page",
    };
  }
  if (isGenericDestination(parsed)) {
    return {
      ...common,
      activityStatus: "verification_failed",
      verificationEvidence: "Generic destination page",
    };
  }
  const postingHtml = primaryPostingHtml(args.body ?? "");
  const structured = structuredPosting(
    postingHtml,
    args.job,
    common.sourceTier === "ats",
  );
  const structuredDeadline = parseTimestamp(structured.validThrough);
  const structuredPostedAt = parseTimestamp(structured.datePosted);
  const applicationAvailable = hasApplicationAction(postingHtml);
  const directApplicationUrl = applicationUrl(postingHtml, normalizedUrl);
  const evidence = {
    ...common,
    structuredDatePosted: structured.datePosted,
    structuredValidThrough: structured.validThrough,
    structuredJobIdentifier: structured.identifier,
    applicationAvailable,
    applicationUrl: directApplicationUrl,
  };
  const pagePostedAt =
    structuredPostedAt ?? relativePostedAt(primaryText, common.verifiedAt);
  const normalizedDatePosted =
    pagePostedAt === null ? null : new Date(pagePostedAt).toISOString();
  const datePostedProvenance: DatePostedProvenance | null = structuredPostedAt
    ? evidence.sourceTier === "employer" || evidence.sourceTier === "ats"
      ? "employer_ats_structured"
      : "jobposting_jsonld"
    : pagePostedAt !== null
      ? "page_explicit"
      : null;
  const datedEvidence = {
    ...evidence,
    datePosted: normalizedDatePosted,
    datePostedProvenance,
  };
  if (
    structured.matched &&
    structuredDeadline !== null &&
    structuredDeadline < common.verifiedAt
  ) {
    return {
      ...datedEvidence,
      identityMatched: true,
      activityStatus: "inactive",
      verificationEvidence: "structured_valid_through_expired",
    };
  }
  if (CLOSED_POSITION_PATTERN.test(primaryText)) {
    return {
      ...datedEvidence,
      activityStatus: "inactive",
      verificationEvidence: "explicit_closed_marker",
      rawSourceText: primaryText.slice(0, 32000),
    };
  }
  const requestedId = externalJobId(new URL(args.job.sourceUrl));
  const finalId = externalJobId(parsed);
  if (requestedId && finalId && requestedId !== finalId) {
    return {
      ...datedEvidence,
      activityStatus: "inactive",
      verificationEvidence: "job_identity_replaced",
    };
  }
  const titleMatched = expectedEntityPresent(primaryText, args.job.title);
  const companyMatched = expectedEntityPresent(
    primaryText,
    args.job.companyName,
  );
  const identityMatched =
    structured.matched || (titleMatched && companyMatched);
  if (structured.anyPosting && !structured.matched) {
    return {
      ...datedEvidence,
      activityStatus: "inactive",
      verificationEvidence: "job_identity_replaced",
    };
  }
  if (!identityMatched) {
    return {
      ...datedEvidence,
      activityStatus: "unknown",
      verificationEvidence: "job_identity_not_confirmed",
    };
  }
  if (structuredDeadline !== null && structuredDeadline >= common.verifiedAt) {
    return {
      ...datedEvidence,
      identityMatched: true,
      activeEvidenceType: "structured_valid_through_future",
      activityStatus: "verified_active",
      verificationEvidence: "structured_valid_through_future",
      rawSourceText: primaryText.slice(0, 32000),
    };
  }
  if (structured.directApply) {
    return {
      ...datedEvidence,
      identityMatched: true,
      applicationAvailable: true,
      activeEvidenceType: "structured_direct_apply",
      activityStatus: "verified_active",
      verificationEvidence: "structured_direct_apply",
      rawSourceText: primaryText.slice(0, 32000),
    };
  }
  if (applicationAvailable) {
    return {
      ...datedEvidence,
      identityMatched: true,
      activeEvidenceType: "active_application_flow",
      activityStatus: "verified_active",
      verificationEvidence: "active_application_flow",
      rawSourceText: primaryText.slice(0, 32000),
    };
  }
  if (
    pagePostedAt !== null &&
    pagePostedAt <= common.verifiedAt + 2 * 24 * 60 * 60 * 1_000 &&
    pagePostedAt >= common.verifiedAt - RECENT_POSTING_MAX_AGE_MS
  ) {
    const activeEvidenceType = structuredPostedAt
      ? "structured_recent_date_posted"
      : "recent_page_date";
    return {
      ...datedEvidence,
      identityMatched: true,
      activeEvidenceType,
      activityStatus: "verified_active",
      verificationEvidence: activeEvidenceType,
      rawSourceText: primaryText.slice(0, 32000),
    };
  }
  return {
    ...datedEvidence,
    identityMatched: true,
    rawSourceText: primaryText.slice(0, 32000),
    activityStatus: "unknown",
    verificationEvidence:
      pagePostedAt === null
        ? "undated_listing_http_only"
        : "old_listing_http_only",
  };
}

export async function verifyJobSource(
  job: VerifiableJob,
): Promise<SourceVerification> {
  const startedAt = Date.now();
  let current = normalizePublicUrl(job.sourceUrl);
  if (!current) return failure(job, "verification_failed", "Unsafe source URL");
  try {
    let redirected = false;
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      const url = new URL(current);
      const response = await requestPinned(url);
      if (response.status === 404 || response.status === 410) {
        return classifySourceResponse({
          job,
          status: response.status,
          finalUrl: current,
          now: startedAt,
        });
      }
      if (response.status >= 300 && response.status < 400) {
        if (redirect === MAX_REDIRECTS) {
          return failure(
            job,
            "verification_failed",
            "Redirect limit exceeded",
            current,
          );
        }
        const locationHeader = response.headers.location;
        const location =
          typeof locationHeader === "string" ? locationHeader : undefined;
        if (!location) {
          return failure(
            job,
            "verification_failed",
            "Redirect missing location",
            current,
          );
        }
        const nextUrl = normalizePublicUrl(
          new URL(location, current).toString(),
        );
        if (!nextUrl) {
          return failure(
            job,
            "verification_failed",
            "Unsafe redirect",
            current,
          );
        }
        current = nextUrl;
        redirected = true;
        continue;
      }
      return classifySourceResponse({
        job,
        status: response.status,
        finalUrl: current,
        contentType: String(response.headers["content-type"] ?? ""),
        body: response.text,
        redirected,
        now: startedAt,
      });
    }
  } catch (error) {
    const category = error instanceof Error ? error.message : "request_failed";
    return classifySourceFailure(job, category, current);
  }
  return failure(
    job,
    "verification_failed",
    "Verification did not complete",
    current,
  );
}

export async function verifyJobSources(jobs: NormalizedJob[], concurrency = 3) {
  const output: Array<{
    job: NormalizedJob;
    verification: SourceVerification;
  }> = [];
  const queues = new Map<string, number[]>();
  jobs.forEach((job, index) => {
    const key = verificationRateLimitKey(job.sourceUrl);
    queues.set(key, [...(queues.get(key) ?? []), index]);
  });
  const providerQueues = [...queues.values()];
  let cursor = 0;
  async function worker() {
    while (cursor < providerQueues.length) {
      const queue = providerQueues[cursor];
      cursor += 1;
      for (const [position, index] of queue.entries()) {
        output[index] = {
          job: jobs[index],
          verification: await verifyJobSource(jobs[index]),
        };
        if (position < queue.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 750));
        }
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, providerQueues.length) }, () =>
      worker(),
    ),
  );
  return output;
}
