import { useId, useRef, useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { LoaderCircle, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ConvexError } from "convex/values";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function PrivateJobDialog({
  job,
  onClose,
  onSaved,
}: {
  job?: Doc<"privateJobs">;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const create = useMutation(api.privateJobs.create);
  const update = useMutation(api.privateJobs.update);
  const [draft, setDraft] = useState({
    title: job?.title ?? "",
    companyName: job?.companyName ?? "",
    sourceUrl: job?.sourceUrl ?? "",
    locationText: job?.locationText ?? "",
    descriptionText: job?.descriptionText ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || !draft.title.trim() || !draft.companyName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      if (job) await update({ jobId: job._id, ...draft });
      else await create({ ...draft, status: "saved" });
      onSaved();
    } catch (failure) {
      setError(
        failure instanceof ConvexError &&
          failure.data?.code === "INVALID_JOB_URL"
          ? "invalidUrl"
          : "error",
      );
    } finally {
      setSaving(false);
    }
  };
  const inputClass =
    "border-input bg-background focus:border-ring focus:ring-ring/30 w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-3";
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent
        initialFocus={titleRef}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        data-analytics-private
      >
        <div className="flex items-start justify-between gap-4">
          <DialogHeader>
            <DialogTitle>
              {t(job ? "privateJobs.edit" : "privateJobs.add")}
            </DialogTitle>
            <DialogDescription>{t("privateJobs.onlyYou")}</DialogDescription>
          </DialogHeader>
          <DialogClose
            disabled={saving}
            aria-label={t("privateJobs.close")}
            className="hover:bg-muted focus-visible:ring-ring/40 grid size-9 shrink-0 place-items-center rounded-lg outline-none focus-visible:ring-3"
          >
            <X aria-hidden="true" className="size-4" />
          </DialogClose>
        </div>
        <form
          onSubmit={(event) => void submit(event)}
          className="mt-5 space-y-4"
        >
          <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2">
            {(
              ["title", "companyName", "sourceUrl", "locationText"] as const
            ).map((field) => (
              <div
                key={field}
                className={
                  field === "sourceUrl" || field === "locationText"
                    ? "sm:col-span-2"
                    : undefined
                }
              >
                <label
                  htmlFor={`${id}-${field}`}
                  className="mb-1.5 block text-sm font-medium"
                >
                  {t(`privateJobs.fields.${field}`)}
                </label>
                <input
                  id={`${id}-${field}`}
                  ref={field === "title" ? titleRef : undefined}
                  type={field === "sourceUrl" ? "url" : "text"}
                  dir={field === "sourceUrl" ? "ltr" : "auto"}
                  value={draft[field]}
                  required={field === "title" || field === "companyName"}
                  maxLength={
                    field === "sourceUrl"
                      ? 2_000
                      : field === "locationText"
                        ? 300
                        : 200
                  }
                  onChange={(event) =>
                    setDraft({ ...draft, [field]: event.target.value })
                  }
                  className={inputClass}
                />
              </div>
            ))}
            <div className="sm:col-span-2">
              <label
                htmlFor={`${id}-description`}
                className="mb-1.5 block text-sm font-medium"
              >
                {t("privateJobs.fields.descriptionText")}
              </label>
              <textarea
                id={`${id}-description`}
                dir="auto"
                rows={3}
                maxLength={10_000}
                value={draft.descriptionText}
                onChange={(event) =>
                  setDraft({ ...draft, descriptionText: event.target.value })
                }
                className={`${inputClass} resize-y leading-6`}
              />
            </div>
          </fieldset>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {t(`privateJobs.${error}`)}
            </p>
          ) : null}
          <div className="border-border flex justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={onClose}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={
                saving || !draft.title.trim() || !draft.companyName.trim()
              }
            >
              {saving ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : null}
              {t(job ? "privateJobs.save" : "privateJobs.add")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
