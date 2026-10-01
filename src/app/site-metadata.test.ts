import { describe, expect, it } from "vitest";
import manifest from "./manifest";
import {
  SITE_NAME,
  SITE_HEBREW_NAME,
  SITE_TITLE,
  SITE_DESCRIPTION,
  websiteStructuredData,
  SITE_URL,
  siteMetadata,
  webApplicationStructuredData,
} from "./site-metadata";

describe("JOBMITER production metadata", () => {
  it("uses the canonical production brand and origin", () => {
    expect(SITE_NAME).toBe("JOBMITER");
    expect(SITE_URL).toBe("https://jobmiter.com");
    expect(siteMetadata.metadataBase?.toString()).toBe("https://jobmiter.com/");
    expect(siteMetadata.applicationName).toBe("JOBMITER");
    expect(siteMetadata.openGraph).toMatchObject({
      siteName: SITE_HEBREW_NAME,
      url: "https://jobmiter.com",
      type: "website",
    });
  });

  it("keeps install and structured-data branding truthful", () => {
    expect(manifest()).toMatchObject({
      name: "JOBMITER",
      short_name: "JOBMITER",
      start_url: "/",
      display: "standalone",
      theme_color: "#0B1F3B",
      icons: [
        {
          src: "/brand/icon.png",
          sizes: "1254x1254",
          type: "image/png",
        },
      ],
    });
    expect(siteMetadata.icons).toEqual({
      icon: [{ url: "/brand/icon.png", type: "image/png" }],
      shortcut: "/brand/icon.png",
      apple: "/brand/icon.png",
    });
    expect(webApplicationStructuredData).toMatchObject({
      "@type": "WebApplication",
      name: SITE_HEBREW_NAME,
      url: "https://jobmiter.com",
      applicationCategory: "BusinessApplication",
    });
  });
  it("keeps canonical, social previews and site identity consistent for Hebrew search", () => {
    expect(siteMetadata.title).toMatchObject({ default: SITE_TITLE });
    expect(siteMetadata.openGraph).toMatchObject({
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      locale: "he_IL",
    });
    expect(siteMetadata.twitter).toMatchObject({
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
    });
    expect(websiteStructuredData).toMatchObject({
      "@type": "WebSite",
      name: SITE_HEBREW_NAME,
      url: SITE_URL,
      inLanguage: "he-IL",
    });
    expect(websiteStructuredData.alternateName).toEqual(
      expect.arrayContaining([
        "ג'וב מיטר",
        "ג'ובמיטר",
        "Job Miter",
        "jobmiter",
      ]),
    );
    expect(manifest()).toMatchObject({ lang: "he", dir: "rtl" });
  });
});
