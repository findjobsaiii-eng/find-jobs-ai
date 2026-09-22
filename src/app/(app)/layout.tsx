import type { ReactNode } from "react";
import type { Metadata } from "next";
import { ProtectedAppLayout } from "@/features/dashboard/app-routes";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AppLayout({ children }: { children: ReactNode }) {
  return <ProtectedAppLayout>{children}</ProtectedAppLayout>;
}
