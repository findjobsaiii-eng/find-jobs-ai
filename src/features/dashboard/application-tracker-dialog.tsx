import { useId, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  CircleDot,
  LoaderCircle,
  MessageCircle,
  Settings2,
  X,
} from "lucide-react";
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
  onSaved,
}: {
  jobId: Id<"jobs">;
  jobTitle: string;
  status?: ApplicationStatus;
  onSaved?: () => void;
}) {
  const { t } = useTranslation();
  const updateTracking = useMutation(api.jobDiscovery.updateJobTracking);
  const [open, setOpen] = useState(false);
  const initialStatus = status ?? "saved";
  const [activeStatus, setActiveStatus] =
    useState<ApplicationStatus>(initialStatus);
  const [draftStatus, setDraftStatus] =
    useState<ApplicationStatus>(initialStatus);
  const [statusComment, setStatusComment] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState<"status" | "note" | null>(null);
  const [error, setError] = useState(false);
  const statusId = useId();
  const statusCommentId = useId();
  const noteId = useId();
  const timeline = useQuery(
    api.jobDiscovery.listJobTrackingTimeline,
    open ? { jobId } : "skip",
  );

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) return;
    setActiveStatus(initialStatus);
    setDraftStatus(initialStatus);
    setStatusComment("");
    setNote("");
    setError(false);
  };

  const saveStatus = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving("status");
    setError(false);
    try {
      await updateTracking({
        jobId,
        status: draftStatus,
        ...(statusComment.trim() ? { notes: statusComment } : {}),
      });
      setActiveStatus(draftStatus);
      setStatusComment("");
      onSaved?.();
    } catch {
      setError(true);
    } finally {
      setSaving(null);
    }
  };

  const addNote = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || !note.trim()) return;
    setSaving("note");
    setError(false);
    try {
      await updateTracking({ jobId, status: activeStatus, notes: note });
      setNote("");
      onSaved?.();
    } catch {
      setError(true);
    } finally {
      setSaving(null);
    }
  };

  const canSaveStatus =
    draftStatus !== activeStatus || statusComment.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" />}>
        <Settings2 aria-hidden="true" />
        {t("applications.tracking.edit")}
      </DialogTrigger>
      <DialogContent className="max-w-xl">
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

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="space-y-5">
            <form onSubmit={(event) => void saveStatus(event)}>
              <fieldset disabled={saving !== null} className="space-y-3">
                <legend className="text-sm font-semibold">
                  {t("applications.tracking.changeStatus")}
                </legend>
                <label htmlFor={statusId} className="sr-only">
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
                <label
                  htmlFor={statusCommentId}
                  className="text-sm font-medium"
                >
                  {t("applications.tracking.statusComment")}
                </label>
                <textarea
                  id={statusCommentId}
                  value={statusComment}
                  maxLength={MAX_NOTES_LENGTH}
                  rows={3}
                  placeholder={t(
                    "applications.tracking.statusCommentPlaceholder",
                  )}
                  onChange={(event) => setStatusComment(event.target.value)}
                  className="border-input bg-background placeholder:text-muted-foreground focus:border-ring focus:ring-ring/30 w-full resize-y rounded-xl border px-3 py-2.5 text-sm leading-6 outline-none focus:ring-3"
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={!canSaveStatus}
                >
                  {saving === "status" ? (
                    <LoaderCircle aria-hidden="true" className="animate-spin" />
                  ) : null}
                  {t("applications.tracking.saveStatus")}
                </Button>
              </fieldset>
            </form>

            <form
              onSubmit={(event) => void addNote(event)}
              className="border-border space-y-3 border-t pt-5"
            >
              <fieldset disabled={saving !== null} className="space-y-3">
                <legend className="text-sm font-semibold">
                  {t("applications.tracking.addNote")}
                </legend>
                <label htmlFor={noteId} className="sr-only">
                  {t("applications.tracking.note")}
                </label>
                <textarea
                  id={noteId}
                  value={note}
                  maxLength={MAX_NOTES_LENGTH}
                  rows={3}
                  placeholder={t("applications.tracking.notePlaceholder")}
                  onChange={(event) => setNote(event.target.value)}
                  className="border-input bg-background placeholder:text-muted-foreground focus:border-ring focus:ring-ring/30 w-full resize-y rounded-xl border px-3 py-2.5 text-sm leading-6 outline-none focus:ring-3"
                />
                <Button
                  type="submit"
                  variant="outline"
                  className="w-full"
                  disabled={!note.trim()}
                >
                  {saving === "note" ? (
                    <LoaderCircle aria-hidden="true" className="animate-spin" />
                  ) : null}
                  {t("applications.tracking.addNoteAction")}
                </Button>
              </fieldset>
            </form>
          </div>

          <section aria-labelledby={`${statusId}-timeline`}>
            <h3 id={`${statusId}-timeline`} className="text-sm font-semibold">
              {t("applications.tracking.timeline")}
            </h3>
            {timeline === undefined ? (
              <div className="text-muted-foreground flex min-h-28 items-center justify-center">
                <LoaderCircle
                  aria-hidden="true"
                  className="size-5 animate-spin"
                />
                <span className="sr-only">
                  {t("applications.tracking.loadingTimeline")}
                </span>
              </div>
            ) : timeline.length ? (
              <ol className="mt-4 space-y-0">
                {timeline.map((event, index) => (
                  <li
                    key={event.id ?? `legacy-${event.createdAt}`}
                    className="relative flex gap-3 pb-5 last:pb-0"
                  >
                    {index < timeline.length - 1 ? (
                      <span
                        aria-hidden="true"
                        className="bg-border absolute start-[0.6875rem] top-6 h-[calc(100%-1rem)] w-px"
                      />
                    ) : null}
                    <span className="bg-primary/10 text-primary ring-background relative z-10 grid size-6 shrink-0 place-items-center rounded-full ring-4">
                      {event.kind === "status_change" ? (
                        <CircleDot aria-hidden="true" className="size-3.5" />
                      ) : (
                        <MessageCircle
                          aria-hidden="true"
                          className="size-3.5"
                        />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {event.kind === "status_change" && event.status
                          ? t("applications.tracking.statusChanged", {
                              status: t(`applications.status.${event.status}`),
                            })
                          : t("applications.tracking.noteAdded")}
                      </p>
                      {event.note ? (
                        <p className="text-foreground/80 mt-1 text-sm leading-6 text-pretty whitespace-pre-wrap">
                          {event.note}
                        </p>
                      ) : null}
                      <LocalizedDate
                        value={event.createdAt}
                        className="text-muted-foreground mt-1.5 inline-block text-xs"
                      />
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-muted-foreground mt-3 text-sm">
                {t("applications.tracking.emptyTimeline")}
              </p>
            )}
          </section>
        </div>

        {error ? (
          <p role="alert" className="text-destructive mt-4 text-sm">
            {t("applications.error")}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
