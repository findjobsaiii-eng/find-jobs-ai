import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppProviders } from "./app-providers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Find Jobs AI",
    template: "%s · Find Jobs AI",
  },
  description:
    "Turn your resume into a focused professional profile and discover jobs that fit.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body>
        <AppProviders convexUrl={process.env.NEXT_PUBLIC_CONVEX_URL}>
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
