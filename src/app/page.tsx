import { HomeRoute } from "@/features/dashboard/app-routes";

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const tab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const view = tab === "in-progress" ? "inProgress" : "suggestions";

  return <HomeRoute view={view} />;
}
