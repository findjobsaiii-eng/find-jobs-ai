import type { ReactNode } from "react";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
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
    <ConvexAuthNextjsServerProvider shouldHandleCode={false}>
      <html lang="he" dir="rtl" suppressHydrationWarning>
        <body>
          <a
            href="#main-content"
            className="bg-background text-foreground fixed start-4 top-2 z-50 -translate-y-24 rounded-lg px-4 py-2 shadow-lg focus:translate-y-0"
          >
            דלג לתוכן / Skip to content
          </a>
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
    </ConvexAuthNextjsServerProvider>
  );
}
