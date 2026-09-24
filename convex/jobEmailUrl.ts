const privateIpv4Patterns = [
  /^10\./u,
  /^127\./u,
  /^169\.254\./u,
  /^192\.168\./u,
  /^172\.(?:1[6-9]|2\d|3[01])\./u,
];

/**
 * Email is an external channel, so its links must never inherit a local auth
 * callback origin. Keep this stricter than SITE_URL, which intentionally
 * permits localhost during development.
 */
export function requirePublicAppUrl(value: string) {
  const configured = value.normalize("NFKC").trim();
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("PUBLIC_APP_URL must be a valid absolute URL");
  }
  const hostname = url.hostname.toLocaleLowerCase("en-US");
  const localHostname =
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "::1" ||
    privateIpv4Patterns.some((pattern) => pattern.test(hostname));
  if (
    url.protocol !== "https:" ||
    localHostname ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "PUBLIC_APP_URL must be a public HTTPS origin without credentials, a path, query, or fragment",
    );
  }
  return url.origin;
}
