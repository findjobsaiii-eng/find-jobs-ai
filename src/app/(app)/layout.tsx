import type { ReactNode } from "react";
import { ProtectedAppLayout } from "@/features/dashboard/app-routes";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <ProtectedAppLayout>{children}</ProtectedAppLayout>;
}
