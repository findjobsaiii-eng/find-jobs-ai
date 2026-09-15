import { cn } from "@/lib/utils";
import type { ApplicationStatus } from "./application-status";
import { APPLICATION_STATUS_VISUALS } from "./application-status-visuals";

export function ApplicationStatusIcon({
  status,
  className,
}: {
  status: ApplicationStatus;
  className?: string;
}) {
  const visual = APPLICATION_STATUS_VISUALS[status];
  const Icon = visual.icon;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-lg",
        visual.iconClass,
        className,
      )}
    >
      <Icon className="size-4" />
    </span>
  );
}
