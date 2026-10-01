import { isAuthenticatedNextjs } from "@convex-dev/auth/nextjs/server";
import type { Metadata } from "next";
import { HomeRoute } from "@/features/dashboard/app-routes";
import {
  websiteStructuredData,
  webApplicationStructuredData,
} from "./site-metadata";

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata(): Promise<Metadata> {
  return (await isAuthenticatedNextjs())
    ? { robots: { index: false, follow: false } }
    : {};
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const [params, initiallyAuthenticated] = await Promise.all([
    searchParams,
    isAuthenticatedNextjs(),
  ]);
  const tab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const view = tab === "in-progress" ? "inProgress" : "suggestions";

  return (
    <>
      {!initiallyAuthenticated && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([
              websiteStructuredData,
              webApplicationStructuredData,
            ]).replace(/</g, "\\u003c"),
          }}
        />
      )}
      <HomeRoute view={view} initiallyAuthenticated={initiallyAuthenticated} />
    </>
  );
}
