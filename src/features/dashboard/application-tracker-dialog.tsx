import { useId, useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { LoaderCircle, Settings2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LocalizedDate } from "@/components/ui/localized-date";
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
} from "./application-status";

const MAX_NOTES_LENGTH = 3_000;

export function ApplicationTrackerDialog({
  jobId,
  jobTitle,
  status,
  notes = "",
  updatedAt,
  onSaved,
}: {
  jobId: Id<"jobs">;
  jobTitle: string;
  status?: ApplicationStatus;
  notes?: string;
  updatedAt?: number;
  onSaved?: () => void;
}) {
  const { t } = useTranslation();
  const updateTracking = useMutation(api.jobDiscovery.updateJobTracking);
  const [open, setOpen] = useState(false);
  const tracked = status !== undefined;
  const initialStatus = status ?? "saved";
  const [draftStatus, setDraftStatus] =
    useState<ApplicationStatus>(initialStatus);
  const [draftNotes, setDraftNotes] = useState(notes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const statusId = useId();
  const notesId = useId();

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) return;
    setDraftStatus(initialStatus);
    setDraftNotes(notes);
    setError(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(false);
    try {
      await updateTracking({
        jobId,
        status: draftStatus,
        notes: draftNotes,
      });
      setOpen(false);
      onSaved?.();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button variant="outline" nativeButton={false} render={<DialogTrigger />}>
        <Settings2 aria-hidden="true" />
        {t(
          tracked ? "applications.tracking.edit" : "applications.tracking.open",
        )}
      </Button>
      <DialogContent>
        <div className="flex items-start justify-between gap-4">
          <DialogHeader>
            <DialogTitle>{t("applications.tracking.title")}</DialogTitle>
            <DialogDescription>
              {t("applications.tracking.description", { title: jobTitle })}
            </DialogDescription>
          </DialogHeader>
          <DialogClose
            aria-label={t("applications.tracking.close")}
            className="hover:bg-muted focus-visible:ring-ring/40 grid size-9 shrink-0 place-items-center rounded-lg outline-none focus-visible:ring-3"
          >
            <X aria-hidden="true" className="size-4" />
          </DialogClose>
        </div>

        <form
          onSubmit={(event) => void submit(event)}
          className="mt-6 space-y-5"
        >
          <div>
            <label
              htmlFor={statusId}
              className="mb-2 block text-sm font-medium"
            >
              {t("applications.tracking.status")}
            </label>
            <select
              id={statusId}
              value={draftStatus}
              onChange={(event) =>
                setDraftStatus(event.target.value as ApplicationStatus)
              }
              className="border-input bg-background focus:border-ring focus:ring-ring/30 h-11 w-full rounded-xl border px-3 text-sm outline-none focus:ring-3"
            >
              {APPLICATION_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {t(`applications.status.${value}`)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={notesId} className="mb-2 block text-sm font-medium">
              {t("applications.tracking.notes")}
            </label>
            <textarea
              id={notesId}
              value={draftNotes}
              maxLength={MAX_NOTES_LENGTH}
              rows={6}
              placeholder={t("applications.tracking.notesPlaceholder")}
              onChange={(event) => setDraftNotes(event.target.value)}
              className="border-input bg-background placeholder:text-muted-foreground focus:border-ring focus:ring-ring/30 w-full resize-y rounded-xl border px-3 py-2.5 text-sm leading-6 outline-none focus:ring-3"
            />
            <span className="text-muted-foreground mt-1 block text-end text-xs tabular-nums">
              {t("applications.tracking.characterCount", {
                count: draftNotes.length,
                max: MAX_NOTES_LENGTH,
              })}
            </span>
          </div>

          {updatedAt ? (
            <p className="text-muted-foreground text-sm">
              <LocalizedDate value={updatedAt}>
                {(date) => t("applications.lastUpdated", { date })}
              </LocalizedDate>
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {t("applications.error")}
            </p>
          ) : null}
          <div className="border-border flex justify-end gap-2 border-t pt-5">
            <Button
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={() => setOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : null}
              {t("applications.tracking.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
