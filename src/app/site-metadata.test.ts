import { describe, expect, it } from "vitest";
import manifest from "./manifest";
import {
  SITE_NAME,
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
      siteName: "JOBMITER",
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
    });
    expect(webApplicationStructuredData).toMatchObject({
      "@type": "WebApplication",
      name: "JOBMITER",
      url: "https://jobmiter.com",
      applicationCategory: "BusinessApplication",
    });
  });
});
