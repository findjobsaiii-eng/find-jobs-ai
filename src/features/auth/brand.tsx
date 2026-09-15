import { JobmiterLogo } from "@/components/ui/jobmiter-logo";

export function Brand({ inverse = false }: { inverse?: boolean }) {
  return <JobmiterLogo responsive variant={inverse ? "inverse" : "default"} />;
}
