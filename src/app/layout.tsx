import type { ReactNode } from "react";
import { AppProviders } from "./app-providers";
import {
  siteMetadata,
  siteViewport,
  webApplicationStructuredData,
} from "./site-metadata";
import "./globals.css";

export const metadata = siteMetadata;
export const viewport = siteViewport;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(webApplicationStructuredData),
          }}
        />
        <AppProviders convexUrl={process.env.NEXT_PUBLIC_CONVEX_URL}>
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
