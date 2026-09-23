import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
import { resolveConvexSiteUrl } from "./src/lib/convex-site-url";

const convexSiteUrl = resolveConvexSiteUrl(
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL,
  process.env.NEXT_PUBLIC_CONVEX_URL,
);
const uploadSentrySourceMaps =
  process.env.VERCEL === "1" &&
  Boolean(
    process.env.SENTRY_ORG &&
    process.env.SENTRY_PROJECT &&
    process.env.SENTRY_AUTH_TOKEN,
  );

function originOf(value: string | undefined) {
  try {
    return value ? new URL(value).origin : null;
  } catch {
    return null;
  }
}

function websocketOriginOf(value: string | undefined) {
  try {
    if (!value) return null;
    const url = new URL(value);
    if (url.protocol === "https:") url.protocol = "wss:";
    else if (url.protocol === "http:") url.protocol = "ws:";
    else return null;
    return url.origin;
  } catch {
    return null;
  }
}

function posthogAssetsOrigin(value: string | undefined) {
  try {
    if (!value) return null;
    const url = new URL(value);
    if (!/^(?:us|eu)\.i\.posthog\.com$/u.test(url.hostname)) return null;
    return `${url.protocol}//${url.hostname.replace(".i.posthog.com", "-assets.i.posthog.com")}`;
  } catch {
    return null;
  }
}

const posthogAssets = posthogAssetsOrigin(process.env.NEXT_PUBLIC_POSTHOG_HOST);
const developmentScriptSource =
  process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";

const remoteConnections = [
  originOf(process.env.NEXT_PUBLIC_CONVEX_URL),
  websocketOriginOf(process.env.NEXT_PUBLIC_CONVEX_URL),
  originOf(convexSiteUrl),
  originOf(process.env.NEXT_PUBLIC_POSTHOG_HOST),
  posthogAssets,
  originOf(process.env.NEXT_PUBLIC_SENTRY_DSN),
  "https://*.googleapis.com",
  "https://*.gstatic.com",
].filter((origin): origin is string => Boolean(origin));

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline'${developmentScriptSource} https://maps.googleapis.com https://maps.gstatic.com ${posthogAssets ?? ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://lh3.googleusercontent.com https://*.googleapis.com https://*.gstatic.com",
  `connect-src 'self' ${remoteConnections.join(" ")}`,
  "worker-src 'self' blob:",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self)",
          },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: uploadSentrySourceMaps ? process.env.SENTRY_AUTH_TOKEN : undefined,
  silent: !process.env.CI,
  sourcemaps: {
    disable: !uploadSentrySourceMaps,
  },
});
