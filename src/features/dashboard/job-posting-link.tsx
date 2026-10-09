import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";

export function JobPostingLink({
  href,
  onClick,
}: {
  href: string;
  onClick?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("jobDiscovery.openPosting")}
      onClick={onClick}
      className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring/40 inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-3 motion-reduce:transition-none @2xl:px-3.5"
    >
      <span className="hidden @2xl:inline">
        {t("jobDiscovery.openPosting")}
      </span>
      <ExternalLink aria-hidden="true" className="size-4" />
    </a>
  );
}
