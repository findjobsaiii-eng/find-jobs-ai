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

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/api/auth/signin/:path*",
        destination: `${convexSiteUrl}/api/auth/signin/:path*`,
      },
      {
        source: "/api/auth/callback/:path*",
        destination: `${convexSiteUrl}/api/auth/callback/:path*`,
      },
    ];
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
