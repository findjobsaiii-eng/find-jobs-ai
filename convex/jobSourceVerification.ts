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
};

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

function visibleText(html: string) {
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

function isGenericDestination(url: URL) {
  const path = url.pathname
    .replace(/^\/+|\/+$/gu, "")
    .toLocaleLowerCase("en-US");
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

function sourceTier(job: NormalizedJob, hostname: string) {
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
  for (const key of ["gh_jid", "jobId", "job_id", "jid", "lever-via"]) {
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
  job: NormalizedJob,
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

export async function verifyJobSource(
  job: NormalizedJob,
): Promise<SourceVerification> {
  let current = normalizePublicUrl(job.sourceUrl);
  if (!current) return failure(job, "verification_failed", "Unsafe source URL");
  try {
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      const url = new URL(current);
      const response = await requestPinned(url);
      if (response.status === 404 || response.status === 410) {
        return failure(job, "inactive", `HTTP ${response.status}`, current);
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
        const redirected = normalizePublicUrl(
          new URL(location, current).toString(),
        );
        if (!redirected) {
          return failure(
            job,
            "verification_failed",
            "Unsafe redirect",
            current,
          );
        }
        current = redirected;
        continue;
      }
      if (response.status < 200 || response.status >= 300) {
        return failure(
          job,
          "verification_failed",
          `HTTP ${response.status}`,
          current,
        );
      }
      const contentType = response.headers["content-type"] ?? "";
      if (
        !/(text\/html|application\/xhtml\+xml|text\/plain)/iu.test(contentType)
      ) {
        return failure(
          job,
          "verification_failed",
          "Unsupported response type",
          current,
        );
      }
      const finalUrl = normalizePublicUrl(current);
      if (!finalUrl || isGenericDestination(new URL(finalUrl))) {
        return failure(
          job,
          "verification_failed",
          "Generic destination page",
          current,
        );
      }
      const text = visibleText(response.text);
      if (
        /(position|job|vacancy|role) (has been |is )?(closed|filled|expired|no longer available)|applications? (are )?closed|המשרה (אוישה|נסגרה|אינה זמינה)/iu.test(
          text,
        )
      ) {
        return failure(
          job,
          "inactive",
          "Closed-position marker present",
          finalUrl,
        );
      }
      if (!expectedEntityPresent(text, job.title)) {
        return failure(
          job,
          "verification_failed",
          "Expected role not confirmed",
          finalUrl,
        );
      }
      if (!expectedEntityPresent(text, job.companyName)) {
        return failure(
          job,
          "verification_failed",
          "Expected company not confirmed",
          finalUrl,
        );
      }
      const parsed = new URL(finalUrl);
      const hostname = parsed.hostname.toLocaleLowerCase("en-US");
      return {
        rawSourceText: text.slice(0, 32000),
        activityStatus: "verified_active",
        finalUrl,
        domain: hostname,
        sourceTier: sourceTier(job, hostname),
        externalJobId: externalJobId(parsed),
        verifiedAt: Date.now(),
        verificationMethod: "http_content_v1",
        verificationEvidence:
          "HTTP 2xx; specific posting; expected role and company confirmed; no closure marker",
      };
    }
  } catch (error) {
    const category = error instanceof Error ? error.message : "request_failed";
    return failure(
      job,
      "verification_failed",
      `Verification failed: ${category}`,
      current,
    );
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
