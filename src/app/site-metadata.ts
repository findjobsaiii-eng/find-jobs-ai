import type { Metadata, Viewport } from "next";
import he from "@/i18n/locales/he.json";

export const SITE_URL = "https://jobmiter.com";
export const SITE_NAME = "JOBMITER";
export const SITE_HEBREW_NAME = he.seo.name;
export const SITE_TITLE = he.seo.title;
export const SITE_DESCRIPTION = he.seo.description;
export const SITE_ALTERNATE_NAMES = [
  "ג׳ובמיטר",
  "ג'וב מיטר",
  "ג'ובמיטר",
  "Jobmiter",
  "Job Miter",
  "job miter",
  "jobmiter",
  "JOBMITER",
];

export const siteMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s | ${SITE_HEBREW_NAME} (Jobmiter)`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    siteName: SITE_HEBREW_NAME,
    url: SITE_URL,
    type: "website",
    locale: "he_IL",
    alternateLocale: "en_US",
    images: [
      { url: "/opengraph-image", width: 1200, height: 630, alt: SITE_TITLE },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/opengraph-image"],
  },
  icons: {
    icon: [{ url: "/brand/icon.png", type: "image/png" }],
    shortcut: "/brand/icon.png",
    apple: "/brand/icon.png",
  },
};

export const siteViewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0B1F3B",
  colorScheme: "light",
};

export const webApplicationStructuredData = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_HEBREW_NAME,
  alternateName: SITE_ALTERNATE_NAMES,
  inLanguage: "he-IL",
  url: SITE_URL,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description: SITE_DESCRIPTION,
};

export const websiteStructuredData = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_HEBREW_NAME,
  alternateName: SITE_ALTERNATE_NAMES,
  url: SITE_URL,
  inLanguage: "he-IL",
};
