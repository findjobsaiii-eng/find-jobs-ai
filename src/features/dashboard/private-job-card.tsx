import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Building2, LoaderCircle, MapPin, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ApplicationTimeline } from "./application-timeline";
import { ApplicationTrackingActions } from "./application-tracking-actions";
import { PrivateJobDialog } from "./private-job-dialog";
import { JobPostingLink } from "./job-posting-link";

export function PrivateJobCard({
  job,
  onChanged,
  onError,
}: {
  job: Doc<"privateJobs">;
  onChanged: (notice: string) => void;
  onError: () => void;
}) {
  const { t } = useTranslation();
  const timeline = useQuery(api.privateJobs.timeline, { jobId: job._id });
  const remove = useMutation(api.privateJobs.remove);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const deleteJob = async () => {
    if (saving) return;
    setSaving(true);
    setError(false);
    try {
      await remove({ jobId: job._id });
      onChanged("privateDeleted");
      setDeleting(false);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };
  return (
    <article
      className="bg-card border-border hover:border-primary/25 @container rounded-3xl border p-5 shadow-[var(--brand-shadow-card)] transition-[border-color,box-shadow] duration-200 hover:shadow-[var(--brand-shadow-card-hover)] motion-reduce:transition-none @md:p-6"
      data-analytics-private
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3
            className="text-lg font-semibold text-pretty @md:text-xl"
            dir="auto"
          >
            {job.title}
          </h3>
          <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-sm">
            <Building2 aria-hidden="true" className="size-3.5 shrink-0" />
            <span dir="auto">{job.companyName}</span>
          </p>
        </div>
        <span className="bg-muted text-muted-foreground shrink-0 rounded-lg px-2.5 py-1 text-xs">
          {t("privateJobs.private")}
        </span>
      </div>
      {job.locationText ? (
        <p className="text-muted-foreground mt-4 flex items-center gap-1.5 text-sm">
          <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
          <span dir="auto">{job.locationText}</span>
        </p>
      ) : null}
      {job.descriptionText ? (
        <p
          dir="auto"
          className="text-foreground/80 mt-4 line-clamp-3 text-sm leading-6 whitespace-pre-wrap"
        >
          {job.descriptionText}
        </p>
      ) : null}
      <ApplicationTimeline
        events={timeline?.map((event) => ({ ...event, id: event._id }))}
      />
      <div className="border-border mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11"
            aria-label={t("privateJobs.edit")}
            onClick={() => setEditing(true)}
          >
            <Pencil aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11"
            aria-label={t("privateJobs.delete")}
            onClick={() => {
              setError(false);
              setDeleting(true);
            }}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
        <div className="flex min-w-0 items-center justify-end gap-2">
          <ApplicationTrackingActions
            jobId={job._id}
            privateJob
            inSuggestions={false}
            status={job.status}
            onChanged={onChanged}
            onRemoveError={onError}
          />
          {job.sourceUrl ? <JobPostingLink href={job.sourceUrl} /> : null}
        </div>
      </div>
      {editing ? (
        <PrivateJobDialog
          job={job}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onChanged("privateUpdated");
          }}
        />
      ) : null}
      <AlertDialog
        open={deleting}
        onOpenChange={(open) => {
          if (!saving) setDeleting(open);
        }}
      >
        <AlertDialogContent data-analytics-private>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("privateJobs.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("privateJobs.deleteDescription", { title: job.title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? (
            <p role="alert" className="text-destructive mt-4 text-sm">
              {t("privateJobs.deleteError")}
            </p>
          ) : null}
          <AlertDialogFooter>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => setDeleting(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={saving}
              onClick={() => void deleteJob()}
            >
              {saving ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : null}
              {t("privateJobs.delete")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
