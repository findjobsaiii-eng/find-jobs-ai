import type { MetadataRoute } from "next";
import { SITE_URL } from "./site-metadata";

const legalPages = ["terms", "privacy", "cookies", "accessibility", "contact"];

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    ...legalPages.flatMap((page) =>
      (["he", "en"] as const).map((language) => ({
        url: `${SITE_URL}/${language}/${page}`,
        changeFrequency: "yearly" as const,
        priority: 0.3,
        alternates: {
          languages: {
            he: `${SITE_URL}/he/${page}`,
            en: `${SITE_URL}/en/${page}`,
          },
        },
      })),
    ),
  ];
}
