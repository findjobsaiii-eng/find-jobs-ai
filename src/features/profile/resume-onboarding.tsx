import { useEffect, useRef, useState, type DragEvent } from "react";
import { useAction, useMutation } from "convex/react";
import { FileText, LoaderCircle, Sparkles, Upload } from "lucide-react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/features/auth/auth-shell";
import { CatalogMultiSelect } from "./reference-multi-select";
import { GooglePlacesMultiSelect } from "./google-places-multi-select";
import type {
  CatalogOption,
  CurrentProfile,
  SelectedPlace,
} from "./profile-types";
import { processingErrorKey } from "./resume-errors";
import { cn } from "@/lib/utils";

const MAX_RESUME_BYTES = 10 * 1024 * 1024;

type ResumeState = FunctionReturnType<typeof api.resumes.getCurrent>;

function resumeLocation(state: ResumeState): SelectedPlace[] {
  if (!state?.location) return [];
  return [
    {
      ...state.location,
      label: state.location.city ?? state.location.formattedAddress,
    },
  ];
}

export function ResumeOnboarding({
  resume,
  identity,
  onEdit,
  onManualEntry,
  onComplete,
  replaceMode = false,
}: {
  resume: ResumeState;
  identity?: CurrentProfile["identity"];
  onEdit: () => void;
  onManualEntry?: () => void;
  onComplete?: () => void;
  replaceMode?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const generateUploadUrl = useMutation(api.resumes.generateUploadUrl);
  const createFromUpload = useMutation(api.resumes.createFromUpload);
  const processResume = useAction(api.resumeActions.processResume);
  const finishReview = useMutation(api.resumes.finishReview);
  const inputRef = useRef<HTMLInputElement>(null);
  const [replacementStarted, setReplacementStarted] = useState(false);
  const visibleResume = replaceMode && !replacementStarted ? null : resume;
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<CatalogOption[]>(
    visibleResume?.targetRoles ?? [],
  );
  const [location, setLocation] = useState<SelectedPlace[]>(() =>
    resumeLocation(visibleResume),
  );
  const [analysisDelayDone, setAnalysisDelayDone] = useState(false);
  const visibleError =
    visibleResume?.status === "failed" && visibleResume.failureCode
      ? processingErrorKey({ data: { code: visibleResume.failureCode } })
      : error;

  useEffect(() => {
    const sync = window.setTimeout(() => {
      setRoles(visibleResume?.targetRoles ?? []);
      setLocation(resumeLocation(visibleResume));
    }, 0);
    if (
      !visibleResume ||
      (visibleResume.status !== "ready" &&
        visibleResume.status !== "needs_confirmation")
    ) {
      const reset = window.setTimeout(() => setAnalysisDelayDone(false), 0);
      return () => {
        window.clearTimeout(sync);
        window.clearTimeout(reset);
      };
    }
    const remaining = Math.max(0, visibleResume.createdAt + 5_000 - Date.now());
    const timeout = window.setTimeout(
      () => setAnalysisDelayDone(true),
      remaining,
    );
    return () => {
      window.clearTimeout(sync);
      window.clearTimeout(timeout);
    };
  }, [visibleResume]);

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

  const accept = async (editAfter = false) => {
    if (finishing || !roles.length || !location[0]) return;
    setFinishing(true);
    setError(null);
    try {
      const place = location[0];
      const normalizedLocation =
        place.formattedAddress &&
        place.country &&
        place.countryCode &&
        place.latitude !== undefined &&
        place.longitude !== undefined
          ? {
              placeId: place.placeId,
              formattedAddress: place.formattedAddress,
              city: place.city,
              administrativeArea: place.administrativeArea,
              country: place.country,
              countryCode: place.countryCode,
              latitude: place.latitude,
              longitude: place.longitude,
              radiusKm: 25,
            }
          : undefined;
      await finishReview({
        targetJobTitleIds: roles.map((role) => role.id),
        ...(normalizedLocation ? { location: normalizedLocation } : {}),
      });
      if (editAfter) onEdit();
      else onComplete?.();
    } catch {
      setError("review");
      setFinishing(false);
    }
  };

  const analyzing =
    uploading ||
    visibleResume?.status === "processing" ||
    ((visibleResume?.status === "ready" ||
      visibleResume?.status === "needs_confirmation") &&
      !analysisDelayDone);
  const ready =
    visibleResume &&
    (visibleResume.status === "ready" ||
      visibleResume.status === "needs_confirmation") &&
    analysisDelayDone;

  return (
    <AuthShell identity={identity}>
      <motion.main
        key={analyzing ? "analyzing" : ready ? "summary" : "upload"}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-xl text-start"
        dir={i18n.dir()}
      >
        {analyzing ? (
          <section className="text-center" aria-live="polite">
            <div className="bg-primary/10 text-primary mx-auto grid size-16 place-items-center rounded-2xl">
              <Sparkles
                aria-hidden="true"
                className="size-7 animate-pulse motion-reduce:animate-none"
              />
            </div>
            <h1 className="mt-6 text-2xl font-semibold text-balance">
              {t("resume.analyzingTitle")}
            </h1>
            <p className="text-muted-foreground mt-2 text-pretty">
              {t("resume.analyzingDescription")}
            </p>
          </section>
        ) : ready ? (
          <section aria-labelledby="resume-summary-title">
            <div className="bg-primary/10 text-primary mb-5 grid size-12 place-items-center rounded-xl">
              <Sparkles aria-hidden="true" className="size-5" />
            </div>
            <h1
              id="resume-summary-title"
              className="text-2xl font-semibold text-balance"
            >
              {t("resume.summaryTitle")}
            </h1>
            <p className="text-muted-foreground mt-2 text-pretty">
              {t("resume.summaryDescription")}
            </p>
            <div className="mt-7 space-y-6">
              <CatalogMultiSelect
                kind="jobTitle"
                label={t("resume.roles")}
                placeholder={t("resume.addRole")}
                values={roles}
                onChange={setRoles}
                maxItems={5}
              />
              {visibleResume.skills.length ? (
                <div>
                  <h2 className="text-sm font-medium">
                    {t("resume.strengths")}
                  </h2>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {visibleResume.skills.slice(0, 10).map((skill) => (
                      <span
                        key={skill.id}
                        className="bg-muted rounded-lg px-2.5 py-1.5 text-sm"
                      >
                        {(i18n.resolvedLanguage === "he"
                          ? skill.labelHe
                          : skill.labelEn) ??
                          skill.labelEn ??
                          skill.labelHe}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <h2 className="text-sm font-medium">
                    {t("resume.experienceLevel")}
                  </h2>
                  <p className="mt-1">
                    {visibleResume.seniority
                      ? t(`resume.seniority.${visibleResume.seniority}`)
                      : t("resume.notFound")}
                  </p>
                </div>
                {visibleResume.totalExperienceYears !== null ? (
                  <div>
                    <h2 className="text-sm font-medium">
                      {t("resume.experience")}
                    </h2>
                    <p className="mt-1">
                      {t("resume.years", {
                        count: visibleResume.totalExperienceYears,
                      })}
                    </p>
                  </div>
                ) : null}
              </div>
              <GooglePlacesMultiSelect
                label={t("resume.location")}
                hint={
                  visibleResume.needsLocation
                    ? t("resume.locationNeeded")
                    : t("resume.locationHint")
                }
                placeholder={t("resume.locationPlaceholder")}
                values={location}
                onChange={setLocation}
                radiusKm={25}
              />
            </div>
            {visibleError ? (
              <p role="alert" className="text-destructive mt-4 text-sm">
                {t(`resume.errors.${visibleError}`)}
              </p>
            ) : null}
            <Button
              className="mt-7 min-h-12 w-full text-base"
              disabled={finishing || !roles.length || !location.length}
              onClick={() => void accept()}
            >
              {finishing ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : (
                <Sparkles aria-hidden="true" />
              )}
              {t("resume.findJobs")}
            </Button>
            <Button
              variant="ghost"
              className="mt-2 min-h-11 w-full"
              disabled={finishing || !roles.length || !location.length}
              onClick={() => void accept(true)}
            >
              {t("resume.editProfile")}
            </Button>
          </section>
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
          </section>
        )}
      </motion.main>
    </AuthShell>
  );
}
