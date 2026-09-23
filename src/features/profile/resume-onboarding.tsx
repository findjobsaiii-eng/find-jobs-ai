import { useEffect, useRef, useState, type DragEvent } from "react";
import { useAction, useMutation } from "convex/react";
import { FileText, Sparkles, Upload } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/features/auth/auth-shell";
import type { CurrentProfile } from "./profile-types";
import { processingErrorKey } from "./resume-errors";
import { cn } from "@/lib/utils";

const MAX_RESUME_BYTES = 10 * 1024 * 1024;
const ANALYSIS_STEPS = ["reading", "skills", "profile"] as const;

type ResumeState = FunctionReturnType<typeof api.resumes.getCurrent>;

function ResumeAnalysisLoader() {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (reducedMotion) return;
    const interval = window.setInterval(() => {
      setStep((current) => (current + 1) % ANALYSIS_STEPS.length);
    }, 2_200);
    return () => window.clearInterval(interval);
  }, [reducedMotion]);

  return (
    <section
      className="text-center"
      role="status"
      aria-labelledby="resume-analysis-title"
      aria-describedby="resume-analysis-description"
    >
      <div className="relative mx-auto size-20">
        <motion.div
          animate={reducedMotion ? undefined : { y: [0, -3, 0] }}
          transition={{ duration: 2.4, ease: "easeInOut", repeat: Infinity }}
          className="bg-primary/10 text-primary border-primary/15 relative grid size-20 place-items-center overflow-hidden rounded-3xl border shadow-[var(--brand-shadow-preview)]"
        >
          <FileText aria-hidden="true" className="size-9" />
          <motion.span
            aria-hidden="true"
            className="from-primary/0 via-primary/70 to-primary/0 absolute inset-x-3 top-3 h-px bg-linear-to-r"
            animate={
              reducedMotion ? undefined : { y: [0, 48, 0], opacity: [0, 1, 0] }
            }
            transition={{ duration: 2.2, ease: "easeInOut", repeat: Infinity }}
          />
        </motion.div>
        <motion.span
          aria-hidden="true"
          className="bg-card text-primary absolute -end-2 -top-2 grid size-8 place-items-center rounded-xl border shadow-sm"
          animate={reducedMotion ? undefined : { rotate: [0, 8, -6, 0] }}
          transition={{ duration: 2.8, ease: "easeInOut", repeat: Infinity }}
        >
          <Sparkles className="size-4" />
        </motion.span>
      </div>

      <h1
        id="resume-analysis-title"
        className="mt-6 text-2xl font-semibold text-balance"
      >
        {t("resume.analyzingTitle")}
      </h1>
      <div className="mt-3 min-h-6" aria-hidden="true">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={ANALYSIS_STEPS[step]}
            initial={reducedMotion ? false : { opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: -5 }}
            transition={{ duration: 0.22 }}
            className="text-primary text-sm font-medium"
          >
            {t(`resume.analyzingSteps.${ANALYSIS_STEPS[step]}`)}
          </motion.p>
        </AnimatePresence>
      </div>
      <p
        id="resume-analysis-description"
        className="text-muted-foreground mt-1 text-pretty"
      >
        {t("resume.analyzingDescription")}
      </p>
    </section>
  );
}

export function ResumeOnboarding({
  resume,
  identity,
  onManualEntry,
  onCancelReplacement,
  replaceMode = false,
}: {
  resume: ResumeState;
  identity?: CurrentProfile["identity"];
  onManualEntry?: () => void;
  onCancelReplacement?: () => void;
  replaceMode?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const generateUploadUrl = useMutation(api.resumes.generateUploadUrl);
  const createFromUpload = useMutation(api.resumes.createFromUpload);
  const processResume = useAction(api.resumeActions.processResume);
  const inputRef = useRef<HTMLInputElement>(null);
  const [replacementForId] = useState(() =>
    replaceMode ? resume?.id : undefined,
  );
  const [replacementStarted, setReplacementStarted] = useState(false);
  const visibleResume =
    replaceMode && (!replacementStarted || resume?.id === replacementForId)
      ? null
      : resume;
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visibleError =
    visibleResume?.status === "failed" && visibleResume.failureCode
      ? processingErrorKey({ data: { code: visibleResume.failureCode } })
      : error;

  const upload = async (file: File) => {
    if (uploading) return;
    if (!/\.(?:pdf|docx)$/iu.test(file.name)) {
      setError("invalid");
      return;
    }
    if (file.size > MAX_RESUME_BYTES) {
      setError("tooLarge");
      return;
    }
    setReplacementStarted(true);
    setUploading(true);
    setError(null);
    try {
      const uploadUrl = await generateUploadUrl({});
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });
      if (!response.ok) throw new Error("upload_failed");
      const { storageId } = (await response.json()) as { storageId: string };
      const resumeId = await createFromUpload({
        storageId: storageId as never,
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        ...(replacementForId ? { replacementForId } : {}),
      });
      await processResume({ resumeId });
    } catch (cause) {
      setError(processingErrorKey(cause));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const dropResume = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length !== 1) {
      setError("multiple");
      return;
    }
    void upload(event.dataTransfer.files[0]);
  };

  const analyzing = uploading || visibleResume?.status === "processing";

  return (
    <AuthShell identity={identity}>
      <motion.div
        key={analyzing ? "analyzing" : "upload"}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-xl text-start"
        dir={i18n.dir()}
      >
        {analyzing ? (
          <ResumeAnalysisLoader />
        ) : (
          <section
            className="text-center"
            aria-labelledby="resume-upload-title"
          >
            <div className="bg-primary/10 text-primary mx-auto grid size-16 place-items-center rounded-2xl">
              <FileText aria-hidden="true" className="size-7" />
            </div>
            <h1
              id="resume-upload-title"
              className="mt-6 text-3xl font-semibold text-balance"
            >
              {t("resume.uploadTitle")}
            </h1>
            <p className="text-muted-foreground mx-auto mt-3 max-w-md leading-7 text-pretty">
              {t("resume.uploadDescription")}
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="sr-only"
              aria-label={t("resume.uploadAction")}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            <div
              role="button"
              tabIndex={0}
              aria-label={t("resume.dropTitle")}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ")
                  inputRef.current?.click();
              }}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node))
                  setDragging(false);
              }}
              onDrop={dropResume}
              className={cn(
                "border-border bg-muted/30 focus-visible:ring-ring/40 mt-7 rounded-2xl border border-dashed p-7 transition-[border-color,background-color,transform] outline-none focus-visible:ring-3",
                dragging && "border-primary bg-primary/5 scale-[1.01]",
              )}
            >
              <Upload
                aria-hidden="true"
                className="text-primary mx-auto size-6"
              />
              <p className="mt-3 font-medium">{t("resume.dropTitle")}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                {t("resume.fileHint")}
              </p>
            </div>
            {visibleError ? (
              <p role="alert" className="text-destructive mt-4 text-sm">
                {t(`resume.errors.${visibleError}`)}
              </p>
            ) : null}
            {onManualEntry ? (
              <Button
                type="button"
                variant="outline"
                className="mt-4 min-h-11 w-full"
                onClick={onManualEntry}
              >
                {t("resume.fillManually")}
              </Button>
            ) : null}
            {replaceMode && onCancelReplacement ? (
              <Button
                type="button"
                variant="ghost"
                className="mt-2 min-h-11 w-full"
                onClick={onCancelReplacement}
              >
                {t("resume.keepCurrent")}
              </Button>
            ) : null}
          </section>
        )}
      </motion.div>
    </AuthShell>
  );
}
