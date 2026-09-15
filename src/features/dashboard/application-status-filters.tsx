import { LayoutGrid } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type {
  ApplicationFilter,
  ApplicationStatus,
} from "./application-status";
import { ApplicationStatusIcon } from "./application-status-visual";
import { APPLICATION_STATUS_VISUALS } from "./application-status-visuals";

export function ApplicationStatusFilters({
  statuses,
  counts,
  value,
  total,
  onChange,
}: {
  statuses: ApplicationStatus[];
  counts: Map<ApplicationStatus, number>;
  value: ApplicationFilter;
  total: number;
  onChange: (status: ApplicationFilter) => void;
}) {
  const { t } = useTranslation();
  if (statuses.length < 2) return null;

  return (
    <div
      className="mb-5 flex flex-wrap gap-2"
      aria-label={t("applications.filters.label")}
    >
      <button
        type="button"
        aria-pressed={value === "all"}
        onClick={() => onChange("all")}
        className={cn(
          "focus-visible:ring-ring/40 flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform] outline-none hover:-translate-y-px focus-visible:ring-3 motion-reduce:transition-none",
          value === "all"
            ? "border-foreground bg-foreground text-background shadow-sm"
            : "border-border bg-card hover:bg-muted",
        )}
      >
        <LayoutGrid aria-hidden="true" className="size-4" />
        {t("applications.filters.all")}
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-xs tabular-nums",
            value === "all" ? "bg-background/15" : "bg-muted",
          )}
        >
          {total}
        </span>
      </button>

      {statuses.map((status) => {
        const selected = value === status;
        return (
          <button
            key={status}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(status)}
            className={cn(
              "focus-visible:ring-ring/40 flex min-h-10 items-center gap-2 rounded-xl border px-2.5 pe-3 text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform] outline-none hover:-translate-y-px focus-visible:ring-3 motion-reduce:transition-none",
              selected
                ? cn(
                    "shadow-sm ring-1",
                    APPLICATION_STATUS_VISUALS[status].selectedClass,
                  )
                : "border-border bg-card hover:bg-muted",
            )}
          >
            <ApplicationStatusIcon
              status={status}
              className="size-6 rounded-md"
            />
            {t(`applications.status.${status}`)}
            <span className="bg-background/70 text-muted-foreground rounded-full px-1.5 py-0.5 text-xs tabular-nums">
              {counts.get(status) ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}
