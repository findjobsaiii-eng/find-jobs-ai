import type { Metadata, Viewport } from "next";

export const SITE_URL = "https://jobmiter.com";
export const SITE_NAME = "JOBMITER";
export const SITE_DESCRIPTION =
  "JOBMITER מנתחת את הניסיון שלך ומחברת אותך למשרות שמתאימות לך באמת באמצעות AI.";

export const siteMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "JOBMITER — חיפוש עבודה חכם עם AI",
    template: "%s | JOBMITER",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "JOBMITER — חיפוש עבודה חכם עם AI",
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
    url: SITE_URL,
    type: "website",
    locale: "he_IL",
    alternateLocale: "en_US",
    images: [
      { url: "/opengraph-image", width: 1200, height: 630, alt: SITE_NAME },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "JOBMITER — AI Job Search, Simplified",
    description:
      "AI-powered job matching that helps you discover relevant opportunities with less searching and more focus.",
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
  name: SITE_NAME,
  url: SITE_URL,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description: SITE_DESCRIPTION,
};
