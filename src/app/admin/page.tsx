import type { Metadata } from "next";
import { AdminRoute } from "@/features/admin/admin-dashboard";

export const metadata: Metadata = {
  title: "Admin · JOBMITER",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminRoute />;
}
