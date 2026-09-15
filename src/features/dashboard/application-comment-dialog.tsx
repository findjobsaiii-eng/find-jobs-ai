import { useId, useRef, useState, type FormEvent } from "react";
import { LoaderCircle, MessageCircle, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ApplicationStatus } from "./application-status";
import { ApplicationStatusIcon } from "./application-status-visual";

const MAX_COMMENT_LENGTH = 3_000;

export function ApplicationCommentDialog({
  open,
  status,
  saving,
  error,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  status?: ApplicationStatus;
  saving: boolean;
  error: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (comment: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [comment, setComment] = useState("");
  const commentId = useId();
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const isStatusChange = status !== undefined;

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (nextOpen) setComment("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || (!isStatusChange && !comment.trim())) return;
    await onSubmit(comment);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md" initialFocus={commentRef}>
        <div className="flex items-start justify-between gap-4">
          <DialogHeader>
            <div className="flex items-center gap-3">
              {status ? (
                <ApplicationStatusIcon status={status} />
              ) : (
                <span className="bg-primary/10 text-primary grid size-8 shrink-0 place-items-center rounded-lg">
                  <MessageCircle aria-hidden="true" className="size-4" />
                </span>
              )}
              <DialogTitle>
                {t(
                  isStatusChange
                    ? "applications.commentDialog.statusTitle"
                    : "applications.commentDialog.noteTitle",
                )}
              </DialogTitle>
            </div>
          </DialogHeader>
          <DialogClose
            aria-label={t("applications.commentDialog.close")}
            className="hover:bg-muted focus-visible:ring-ring/40 grid size-9 shrink-0 place-items-center rounded-lg outline-none focus-visible:ring-3"
          >
            <X aria-hidden="true" className="size-4" />
          </DialogClose>
        </div>

        <form
          onSubmit={(event) => void submit(event)}
          className="mt-5 space-y-4"
        >
          <label htmlFor={commentId} className="sr-only">
            {t("applications.commentDialog.comment")}
          </label>
          <textarea
            id={commentId}
            ref={commentRef}
            value={comment}
            maxLength={MAX_COMMENT_LENGTH}
            rows={4}
            placeholder={t(
              isStatusChange
                ? "applications.commentDialog.statusPlaceholder"
                : "applications.commentDialog.notePlaceholder",
            )}
            onChange={(event) => setComment(event.target.value)}
            className="border-input bg-background placeholder:text-muted-foreground focus:border-ring focus:ring-ring/30 w-full resize-y rounded-xl border px-3 py-2.5 text-sm leading-6 outline-none focus:ring-3"
          />
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {t("applications.error")}
            </p>
          ) : null}
          <div className="border-border flex justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={saving || (!isStatusChange && !comment.trim())}
            >
              {saving ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : null}
              {t(
                isStatusChange
                  ? "applications.commentDialog.confirmStatus"
                  : "applications.commentDialog.addComment",
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
