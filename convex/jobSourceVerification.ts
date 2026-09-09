"use node";

import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import type { IncomingHttpHeaders } from "node:http";
import type { NormalizedJob } from "./jobDiscoveryModel";
import { normalizePublicUrl } from "./jobDiscoveryModel";

const REQUEST_TIMEOUT_MS = 8_000;
const DNS_TIMEOUT_MS = 3_000;
const MAX_REDIRECTS = 3;
const MAX_RESPONSE_BYTES = 512 * 1_024;

export type SourceVerification = {
  activityStatus: "verified_active" | "inactive" | "verification_failed";
  finalUrl: string | null;
  domain: string;
  sourceTier: "employer" | "ats" | "job_board" | "aggregator";
  externalJobId: string | null;
  verifiedAt: number;
  verificationMethod: "http_content_v1";
  verificationEvidence: string;
  rawSourceText?: string;
  httpStatus?: number;
};

export type VerifiableJob = Pick<
  NormalizedJob,
  "title" | "companyName" | "sourceUrl" | "sourceType"
>;

const ATS_DOMAINS = [
  "greenhouse.io",
  "lever.co",
  "myworkdayjobs.com",
  "smartrecruiters.com",
  "ashbyhq.com",
  "recruitee.com",
] as const;
const JOB_BOARD_DOMAINS = [
  "linkedin.com",
  "indeed.com",
  "glassdoor.com",
  "alljobs.co.il",
  "drushim.co.il",
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
  if (ATS_DOMAINS.some((domain) => domainMatches(hostname, domain)))
    return "ats";
  if (job.sourceType === "employer") return "employer";
  if (
    job.sourceType === "job_board" ||
    JOB_BOARD_DOMAINS.some((domain) => domainMatches(hostname, domain))
  ) {
    return "job_board";
  }
  return "aggregator";
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
    verificationMethod: "http_content_v1",
    verificationEvidence: evidence.slice(0, 240),
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
  /(?:position|job|vacancy|role) (?:has been |is )?(?:closed|filled|expired|no longer available)|applications? (?:are )?closed|vacancy closed|position filled|משרה (?:זו )?(?:אוישה|נסגרה|אינה זמינה|אינה בתוקף)|הגשת המועמדות הסתיימה/iu;

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
    verificationMethod: "http_content_v1" as const,
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
  if (
    /\b(?:sign in|log in|captcha|access denied|verify you are human|just a moment)\b/iu.test(
      text,
    ) &&
    !expectedEntityPresent(text, args.job.title)
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
    !expectedEntityPresent(text, args.job.title)
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
  // Only trust JobPosting data for this specific role/company, never related jobs.
  let matchingStructuredJobPosting = false;
  for (const script of (args.body ?? "").matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu,
  )) {
    try {
      const parsedData: unknown = JSON.parse(script[1]);
      const queue: unknown[] = [parsedData];
      for (let i = 0; i < queue.length && i < 100; i += 1) {
        const item = queue[i];
        if (Array.isArray(item)) {
          queue.push(...item.slice(0, 100));
          continue;
        }
        if (!item || typeof item !== "object") continue;
        const data = item as Record<string, unknown>;
        if (data["@graph"]) queue.push(data["@graph"]);
        const organization = data.hiringOrganization as
          Record<string, unknown> | undefined;
        if (
          data["@type"] !== "JobPosting" ||
          typeof data.title !== "string" ||
          !expectedEntityPresent(data.title, args.job.title) ||
          typeof organization?.name !== "string" ||
          !expectedEntityPresent(organization.name, args.job.companyName)
        )
          continue;
        matchingStructuredJobPosting = true;
        const deadline =
          typeof data.validThrough === "string"
            ? Date.parse(data.validThrough)
            : NaN;
        if (Number.isFinite(deadline) && deadline < common.verifiedAt) {
          return {
            ...common,
            activityStatus: "inactive",
            verificationEvidence: "JobPosting validThrough passed",
          };
        }
      }
    } catch {
      /* Malformed structured data is not closure evidence. */
    }
  }
  if (CLOSED_POSITION_PATTERN.test(text)) {
    return {
      ...common,
      activityStatus: "inactive",
      verificationEvidence: "Closed-position marker present",
      rawSourceText: text.slice(0, 32000),
    };
  }
  if (!expectedEntityPresent(text, args.job.title)) {
    return {
      ...common,
      activityStatus: "verification_failed",
      verificationEvidence: "Expected role not confirmed",
    };
  }
  if (!expectedEntityPresent(text, args.job.companyName)) {
    return {
      ...common,
      activityStatus: "verification_failed",
      verificationEvidence: "Expected company not confirmed",
    };
  }
  return {
    ...common,
    rawSourceText: text.slice(0, 32000),
    activityStatus: "verified_active",
    verificationEvidence: matchingStructuredJobPosting
      ? "Structured JobPosting valid; HTTP 2xx"
      : "HTTP 2xx; specific posting; expected role and company confirmed; no closure marker",
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
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const index = cursor;
      cursor += 1;
      output[index] = {
        job: jobs[index],
        verification: await verifyJobSource(jobs[index]),
      };
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker()),
  );
  return output;
}
