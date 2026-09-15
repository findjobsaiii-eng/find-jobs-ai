import { isAuthenticatedNextjs } from "@convex-dev/auth/nextjs/server";
import { HomeRoute } from "@/features/dashboard/app-routes";

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const [params, initiallyAuthenticated] = await Promise.all([
    searchParams,
    isAuthenticatedNextjs(),
  ]);
  const tab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const view = tab === "in-progress" ? "inProgress" : "suggestions";

  return (
    <HomeRoute view={view} initiallyAuthenticated={initiallyAuthenticated} />
  );
}
