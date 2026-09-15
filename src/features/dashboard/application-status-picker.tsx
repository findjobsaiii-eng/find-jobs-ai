import { Popover } from "@base-ui/react/popover";
import { Bookmark, Check, ChevronDown, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
} from "./application-status";
import { ApplicationStatusIcon } from "./application-status-visual";

export function ApplicationStatusPicker({
  status,
  disabled,
  onSelect,
}: {
  status?: ApplicationStatus;
  disabled?: boolean;
  onSelect: (status: ApplicationStatus) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [savingStatus, setSavingStatus] = useState<ApplicationStatus | null>(
    null,
  );

  const selectStatus = async (nextStatus: ApplicationStatus) => {
    if (savingStatus) return;
    setSavingStatus(nextStatus);
    try {
      await onSelect(nextStatus);
      setOpen(false);
    } finally {
      setSavingStatus(null);
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        render={<Button variant="outline" className="min-h-11" />}
        disabled={disabled}
        aria-label={t("applications.statusPicker.open")}
      >
        {status ? (
          <ApplicationStatusIcon
            status={status}
            className="size-6 rounded-md"
          />
        ) : (
          <Bookmark aria-hidden="true" />
        )}
        {status
          ? t("applications.statusPicker.savedAs", {
              status: t(`applications.status.${status}`),
            })
          : t("applications.statusPicker.save")}
        <ChevronDown aria-hidden="true" className="size-3.5" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="top"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="z-50"
        >
          <Popover.Popup className="bg-popover text-popover-foreground border-border max-h-[min(28rem,var(--available-height))] w-72 max-w-[calc(100vw-2rem)] origin-[var(--transform-origin)] overflow-y-auto rounded-2xl border p-2 text-start shadow-xl transition-[transform,opacity] duration-150 outline-none data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none">
            <p className="px-3 py-2 text-sm font-semibold">
              {t("applications.statusPicker.title")}
            </p>
            <div className="space-y-0.5">
              {APPLICATION_STATUSES.map((value) => (
                <button
                  key={value}
                  type="button"
                  disabled={savingStatus !== null}
                  onClick={() => void selectStatus(value)}
                  className="hover:bg-muted focus-visible:ring-ring/40 flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-start text-sm transition-colors outline-none focus-visible:ring-3 disabled:opacity-60 motion-reduce:transition-none"
                >
                  <ApplicationStatusIcon
                    status={value}
                    className="size-7 rounded-md"
                  />
                  <span className="flex-1">
                    {t(`applications.status.${value}`)}
                  </span>
                  <span className="ms-auto grid size-5 shrink-0 place-items-center">
                    {savingStatus === value ? (
                      <LoaderCircle
                        aria-hidden="true"
                        className="size-4 animate-spin"
                      />
                    ) : status === value ? (
                      <Check aria-hidden="true" className="size-4" />
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
