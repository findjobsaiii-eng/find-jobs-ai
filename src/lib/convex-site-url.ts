function parseOrigin(value: string) {
  const url = new URL(value);
  const isSecure = url.protocol === "https:";
  const isLocal =
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1");

  if (
    (!isSecure && !isLocal) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error();
  }

  return url;
}

export function resolveConvexSiteUrl(
  configuredSiteUrl: string | undefined,
  convexCloudUrl: string | undefined,
) {
  if (configuredSiteUrl?.trim()) {
    try {
      return parseOrigin(configuredSiteUrl).origin;
    } catch {
      throw new Error(
        "NEXT_PUBLIC_CONVEX_SITE_URL must be an HTTPS origin or a local HTTP origin",
      );
    }
  }

  if (convexCloudUrl?.trim()) {
    try {
      const cloudUrl = parseOrigin(convexCloudUrl);
      if (cloudUrl.hostname.endsWith(".convex.cloud")) {
        cloudUrl.hostname = cloudUrl.hostname.replace(
          /\.convex\.cloud$/,
          ".convex.site",
        );
        return cloudUrl.origin;
      }
    } catch {
      // Fall through to the actionable configuration error below.
    }
  }

  throw new Error(
    "Set NEXT_PUBLIC_CONVEX_SITE_URL when NEXT_PUBLIC_CONVEX_URL is not a standard Convex Cloud URL",
  );
}
