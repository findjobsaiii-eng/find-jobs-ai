import type { Metadata } from "next";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { AdminJobsPreviewRoute } from "@/features/admin/admin-jobs-preview";

export const metadata: Metadata = {
  title: "Preview Jobs · Admin · JOBMITER",
  robots: { index: false, follow: false },
};

type AdminJobsPreviewPageProps = {
  params: Promise<{ userId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminJobsPreviewPage({
  params,
  searchParams,
}: AdminJobsPreviewPageProps) {
  const [{ userId }, query] = await Promise.all([params, searchParams]);
  const tab = Array.isArray(query.tab) ? query.tab[0] : query.tab;

  return (
    <AdminJobsPreviewRoute
      userId={userId as Id<"users">}
      initialView={tab === "in-progress" ? "inProgress" : "suggestions"}
    />
  );
}
