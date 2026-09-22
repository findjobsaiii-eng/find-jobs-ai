import type { MetadataRoute } from "next";
import { SITE_URL } from "./site-metadata";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/profile", "/resume", "/sentry-test"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
