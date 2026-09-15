import { useState } from "react";
import { useMutation } from "convex/react";
import { MessageCirclePlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { ApplicationCommentDialog } from "./application-comment-dialog";
import { ApplicationStatusPicker } from "./application-status-picker";
import type { ApplicationStatus } from "./application-status";

type DialogMode =
  { kind: "status"; status: ApplicationStatus } | { kind: "note" };

export function ApplicationTrackingActions({
  jobId,
  jobTitle,
  status,
  onChanged,
  onRemoveError,
}: {
  jobId: Id<"jobs">;
  jobTitle: string;
  status?: ApplicationStatus;
  onChanged: (notice: "marked" | "trackingSaved" | "unmarked") => void;
  onRemoveError: () => void;
}) {
  const { t } = useTranslation();
  const updateTracking = useMutation(api.jobDiscovery.updateJobTracking);
  const addNote = useMutation(api.jobDiscovery.addJobTrackingNote);
  const removeTracking = useMutation(api.jobDiscovery.removeJobTracking);
  const [dialogMode, setDialogMode] = useState<DialogMode | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const submit = async (comment: string) => {
    if (!dialogMode || saving) return;
    setSaving(true);
    setError(false);
    try {
      if (dialogMode.kind === "status") {
        await updateTracking({
          jobId,
          status: dialogMode.status,
          ...(comment.trim() ? { note: comment } : {}),
        });
        onChanged(dialogMode.status === "saved" ? "marked" : "trackingSaved");
      } else {
        await addNote({ jobId, note: comment });
        onChanged(status ? "trackingSaved" : "marked");
      }
      setDialogMode(null);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await removeTracking({ jobId });
      onChanged("unmarked");
    } catch {
      onRemoveError();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <ApplicationStatusPicker
          status={status}
          disabled={saving}
          onSelect={(nextStatus) => {
            if (nextStatus !== status) {
              setError(false);
              setDialogMode({ kind: "status", status: nextStatus });
            }
          }}
          onRemove={status ? remove : undefined}
        />
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="min-h-11 min-w-11"
          disabled={saving}
          aria-label={t("applications.commentDialog.open")}
          onClick={() => {
            setError(false);
            setDialogMode({ kind: "note" });
          }}
        >
          <MessageCirclePlus aria-hidden="true" />
        </Button>
      </div>
      {dialogMode ? (
        <ApplicationCommentDialog
          open
          jobTitle={jobTitle}
          status={dialogMode.kind === "status" ? dialogMode.status : undefined}
          saving={saving}
          error={error}
          onOpenChange={(open) => {
            if (!open && !saving) setDialogMode(null);
          }}
          onSubmit={submit}
        />
      ) : null}
    </>
  );
}
