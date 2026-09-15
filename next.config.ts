import type { NextConfig } from "next";
import { resolveConvexSiteUrl } from "./src/lib/convex-site-url";

const convexSiteUrl = resolveConvexSiteUrl(
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL,
  process.env.NEXT_PUBLIC_CONVEX_URL,
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

export default nextConfig;
