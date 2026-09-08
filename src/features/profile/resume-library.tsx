import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  Check,
  ChevronDown,
  FileText,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { SectionHeader, Surface } from "@/components/ui/product-layout";
import { cn } from "@/lib/utils";
import { processingErrorKey } from "./resume-errors";

const MAX_BYTES = 10 * 1024 * 1024;
const validResume = (file: File) => /\.(?:pdf|docx)$/iu.test(file.name);

export function ResumeLibrary() {
  const { t, i18n } = useTranslation();
  const resumes = useQuery(api.resumes.listMine);
  const generateUploadUrl = useMutation(api.resumes.generateUploadUrl);
  const createFromUpload = useMutation(api.resumes.createFromUpload);
  const processResume = useAction(api.resumeActions.processResume);
  const updateMetadata = useMutation(api.resumes.updateMetadata);
  const setActive = useMutation(api.resumes.setActive);
  const deleteResume = useMutation(api.resumes.deleteResume);
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<Id<"resumeDocuments"> | "upload" | null>(
    null,
  );
  const [replaceId, setReplaceId] = useState<Id<"resumeDocuments"> | null>(
    null,
  );
  const [expandedId, setExpandedId] = useState<Id<"resumeDocuments"> | null>(
    null,
  );
  const [editingId, setEditingId] = useState<Id<"resumeDocuments"> | null>(
    null,
  );
  const [deleteId, setDeleteId] = useState<Id<"resumeDocuments"> | null>(null);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editNote, setEditNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const upload = async (
    files: FileList | File[],
    replacementForId?: Id<"resumeDocuments">,
  ) => {
    const selected = Array.from(files);
    if (selected.length !== 1) return setError("multiple");
    const file = selected[0];
    if (!validResume(file)) return setError("unsupported");
    if (file.size > MAX_BYTES) return setError("tooLarge");
    setBusy(replacementForId ?? "upload");
    setError(null);
    try {
      const uploadUrl = await generateUploadUrl({});
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!response.ok) throw new Error("UPLOAD_FAILED");
      const { storageId } = (await response.json()) as { storageId: string };
      const resumeId = await createFromUpload({
        storageId: storageId as never,
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        ...(replacementForId
          ? { replacementForId }
          : {
              ...(label.trim() ? { displayName: label } : {}),
              ...(note.trim() ? { note } : {}),
              activateOnSuccess: false,
            }),
      });
      await processResume({ resumeId });
      setLabel("");
      setNote("");
      setReplaceId(null);
    } catch (cause) {
      setError(processingErrorKey(cause));
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
      if (replaceInputRef.current) replaceInputRef.current.value = "";
    }
  };

  const saveMetadata = async () => {
    if (!editingId || !editLabel.trim()) return;
    setBusy(editingId);
    try {
      await updateMetadata({
        resumeId: editingId,
        displayName: editLabel,
        note: editNote.trim() || null,
      });
      setEditingId(null);
    } catch {
      setError("save");
    } finally {
      setBusy(null);
    }
  };
  const activate = async (resumeId: Id<"resumeDocuments">) => {
    setBusy(resumeId);
    try {
      await setActive({ resumeId });
    } catch {
      setError("activate");
    } finally {
      setBusy(null);
    }
  };
  const remove = async (resumeId: Id<"resumeDocuments">) => {
    setBusy(resumeId);
    try {
      await deleteResume({ resumeId });
      setDeleteId(null);
    } catch {
      setError("delete");
    } finally {
      setBusy(null);
    }
  };
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void upload(event.dataTransfer.files);
  };
  const handleDropKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      inputRef.current?.click();
    }
  };

  return (
    <Surface className="scroll-mt-24">
      <SectionHeader
        title={t("resumeLibrary.title")}
        description={t("resumeLibrary.description")}
      />
      <div
        role="button"
        tabIndex={0}
        aria-label={t("resumeLibrary.dropzoneLabel")}
        onKeyDown={handleDropKey}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node))
            setDragging(false);
        }}
        onDrop={handleDrop}
        className={cn(
          "border-border bg-muted/30 focus-visible:ring-ring/40 rounded-2xl border border-dashed p-5 text-center transition-[border-color,background-color,transform] outline-none focus-visible:ring-3 sm:p-7",
          dragging && "border-primary bg-primary/5 scale-[1.01]",
        )}
      >
        <span className="bg-primary/10 text-primary mx-auto grid size-11 place-items-center rounded-xl">
          {busy === "upload" ? (
            <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
          ) : (
            <Upload aria-hidden="true" className="size-5" />
          )}
        </span>
        <p className="mt-3 font-medium">{t("resumeLibrary.dropTitle")}</p>
        <p className="text-muted-foreground mt-1 text-sm">
          {t("resumeLibrary.dropDescription")}
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(event) => {
          if (event.target.files) void upload(event.target.files);
        }}
      />
      <input
        ref={replaceInputRef}
        type="file"
        className="sr-only"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(event) => {
          if (event.target.files && replaceId)
            void upload(event.target.files, replaceId);
        }}
      />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">
          {t("resumeLibrary.label")}
          <input
            value={label}
            maxLength={80}
            onChange={(event) => setLabel(event.target.value)}
            className="border-input bg-background focus:ring-ring/30 mt-2 h-11 w-full rounded-xl border px-3 outline-none focus:ring-3"
          />
        </label>
        <label className="text-sm font-medium">
          {t("resumeLibrary.note")}
          <input
            value={note}
            maxLength={300}
            onChange={(event) => setNote(event.target.value)}
            className="border-input bg-background focus:ring-ring/30 mt-2 h-11 w-full rounded-xl border px-3 outline-none focus:ring-3"
          />
        </label>
      </div>
      {error ? (
        <p role="alert" className="text-destructive mt-3 text-sm">
          {t("resumeLibrary.errors." + error)}
        </p>
      ) : null}

      {resumes === undefined ? (
        <div className="mt-6 flex justify-center py-8">
          <LoaderCircle
            aria-hidden="true"
            className="text-primary size-6 animate-spin"
          />
          <span className="sr-only">{t("resumeLibrary.loading")}</span>
        </div>
      ) : !Array.isArray(resumes) || resumes.length === 0 ? (
        <div className="mt-6 py-8 text-center">
          <FileText
            aria-hidden="true"
            className="text-muted-foreground mx-auto size-8"
          />
          <p className="mt-3 font-medium">{t("resumeLibrary.empty")}</p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {resumes.map((resume) => (
            <li
              key={resume.id}
              className="border-border rounded-2xl border p-4 sm:p-5"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <span className="bg-muted text-muted-foreground grid size-10 shrink-0 place-items-center rounded-xl">
                  {resume.status === "processing" || busy === resume.id ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="size-5 animate-spin"
                    />
                  ) : (
                    <FileText aria-hidden="true" className="size-5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{resume.displayName}</h3>
                    {resume.isActive ? (
                      <span className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium">
                        <Check aria-hidden="true" className="size-3" />
                        {t("resumeLibrary.active")}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground mt-1 truncate text-sm">
                    {resume.fileName}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {t("resumeLibrary.metadata", {
                      type: resume.fileName.toLowerCase().endsWith(".docx")
                        ? "DOCX"
                        : "PDF",
                      size: (resume.size / 1024).toFixed(0),
                      date: new Intl.DateTimeFormat(i18n.language, {
                        dateStyle: "medium",
                      }).format(resume.createdAt),
                    })}
                  </p>
                  <p
                    className={cn(
                      "mt-1 text-xs",
                      resume.status === "failed"
                        ? "text-destructive"
                        : "text-muted-foreground",
                    )}
                  >
                    {t(
                      `resumeLibrary.status.${resume.status === "failed" ? "failed" : resume.status === "processing" ? "processing" : "ready"}`,
                    )}
                  </p>
                  {resume.note ? (
                    <p className="text-foreground/75 mt-2 text-sm">
                      {resume.note}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  {!resume.isActive &&
                  resume.status !== "processing" &&
                  resume.status !== "failed" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() => void activate(resume.id)}
                    >
                      {t("resumeLibrary.useForMatching")}
                    </Button>
                  ) : null}
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t("resumeLibrary.details")}
                    aria-expanded={expandedId === resume.id}
                    onClick={() =>
                      setExpandedId((current) =>
                        current === resume.id ? null : resume.id,
                      )
                    }
                  >
                    <ChevronDown
                      aria-hidden="true"
                      className={cn(
                        "transition-transform",
                        expandedId === resume.id && "rotate-180",
                      )}
                    />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t("resumeLibrary.edit")}
                    onClick={() => {
                      setEditingId(resume.id);
                      setEditLabel(resume.displayName);
                      setEditNote(resume.note ?? "");
                    }}
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t("resumeLibrary.replace")}
                    onClick={() => {
                      setReplaceId(resume.id);
                      replaceInputRef.current?.click();
                    }}
                  >
                    <RefreshCw aria-hidden="true" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive"
                    aria-label={t("resumeLibrary.delete")}
                    onClick={() => setDeleteId(resume.id)}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </div>
              {expandedId === resume.id ? (
                <div className="border-border mt-4 space-y-2 border-t pt-4 text-sm">
                  {resume.targetRoles.length ? (
                    <p>
                      <span className="font-medium">{t("resume.roles")}:</span>{" "}
                      {resume.targetRoles
                        .map((role) => role.labelHe ?? role.labelEn)
                        .join(" · ")}
                    </p>
                  ) : null}
                  {resume.skills.length ? (
                    <p>
                      <span className="font-medium">
                        {t("resume.strengths")}:
                      </span>{" "}
                      {resume.skills
                        .slice(0, 8)
                        .map((skill) => skill.labelHe ?? skill.labelEn)
                        .join(" · ")}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {editingId === resume.id ? (
                <div className="border-border mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2">
                  <label className="text-sm font-medium">
                    {t("resumeLibrary.label")}
                    <input
                      value={editLabel}
                      maxLength={80}
                      onChange={(event) => setEditLabel(event.target.value)}
                      className="border-input mt-2 h-11 w-full rounded-xl border px-3"
                    />
                  </label>
                  <label className="text-sm font-medium">
                    {t("resumeLibrary.note")}
                    <input
                      value={editNote}
                      maxLength={300}
                      onChange={(event) => setEditNote(event.target.value)}
                      className="border-input mt-2 h-11 w-full rounded-xl border px-3"
                    />
                  </label>
                  <div className="flex gap-2 sm:col-span-2">
                    <Button size="sm" onClick={() => void saveMetadata()}>
                      {t("common.save")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingId(null)}
                    >
                      {t("common.cancel")}
                    </Button>
                  </div>
                </div>
              ) : null}
              {deleteId === resume.id ? (
                <div
                  role="alertdialog"
                  aria-label={t("resumeLibrary.deleteTitle", {
                    name: resume.displayName,
                  })}
                  className="border-destructive/20 bg-destructive/5 mt-4 rounded-xl border p-4"
                >
                  <p className="font-medium">
                    {t("resumeLibrary.deleteTitle", {
                      name: resume.displayName,
                    })}
                  </p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {resume.isActive
                      ? t(
                          resumes.length > 1
                            ? "resumeLibrary.deleteActiveDescription"
                            : "resumeLibrary.deleteLastDescription",
                        )
                      : t("resumeLibrary.deleteDescription")}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy !== null}
                      onClick={() => void remove(resume.id)}
                    >
                      {t("resumeLibrary.confirmDelete")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteId(null)}
                    >
                      {t("common.cancel")}
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Surface>
  );
}
