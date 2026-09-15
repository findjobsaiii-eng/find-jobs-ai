import { MessageCircle } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { LocalizedDate } from "@/components/ui/localized-date";
import type { ApplicationStatus } from "./application-status";
import { ApplicationStatusIcon } from "./application-status-visual";

export type ApplicationTimelineEvent =
  | {
      id: string;
      kind: "status_change";
      status: ApplicationStatus;
      note?: string;
      createdAt: number;
    }
  | {
      id: string;
      kind: "note";
      note: string;
      createdAt: number;
    };

const COLLAPSED_EVENT_COUNT = 3;

export function ApplicationTimeline({
  events,
}: {
  events?: ApplicationTimelineEvent[];
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  if (!events?.length) return null;
  const visibleEvents = expanded
    ? events
    : events.slice(0, COLLAPSED_EVENT_COUNT);

  return (
    <section className="mt-5" aria-label={t("applications.tracking.timeline")}>
      <ol className="space-y-0">
        {visibleEvents.map((event, index) => (
          <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
            {index < visibleEvents.length - 1 ? (
              <span
                aria-hidden="true"
                className="bg-border absolute start-4 top-8 h-[calc(100%-1rem)] w-px"
              />
            ) : null}
            {event.kind === "status_change" && event.status ? (
              <ApplicationStatusIcon
                status={event.status}
                className="ring-card relative z-10 size-8 rounded-full ring-4"
              />
            ) : (
              <span className="bg-muted text-muted-foreground ring-card relative z-10 grid size-8 shrink-0 place-items-center rounded-full ring-4">
                <MessageCircle aria-hidden="true" className="size-4" />
              </span>
            )}
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-sm font-medium">
                  {event.kind === "status_change" && event.status
                    ? t("applications.tracking.statusChanged", {
                        status: t(`applications.status.${event.status}`),
                      })
                    : t("applications.tracking.noteAdded")}
                </p>
                <LocalizedDate
                  value={event.createdAt}
                  className="text-muted-foreground text-xs"
                />
              </div>
              {event.note ? (
                <p className="text-foreground/80 mt-1 text-sm leading-6 text-pretty whitespace-pre-wrap">
                  {event.note}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      {events.length > COLLAPSED_EVENT_COUNT ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => setExpanded((value) => !value)}
        >
          {t(
            expanded
              ? "applications.tracking.showLess"
              : "applications.tracking.showAll",
            { count: events.length },
          )}
        </Button>
      ) : null}
    </section>
  );
}
