import { useEffect, useRef, useState } from "react";
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
import type { CatalogOption, SelectedPlace } from "./profile-types";

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
  onEdit,
  replaceMode = false,
}: {
  resume: ResumeState;
  onEdit: () => void;
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
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<CatalogOption[]>(
    visibleResume?.targetRoles ?? [],
  );
  const [location, setLocation] = useState<SelectedPlace[]>(() =>
    resumeLocation(visibleResume),
  );
  const [analysisDelayDone, setAnalysisDelayDone] = useState(false);

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
    setReplacementStarted(true);
    setUploading(true);
    setError(null);
    try {
      const uploadUrl = await generateUploadUrl({});
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
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
    } catch {
      setError("upload");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
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
    <AuthShell>
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
            <h1 className="mt-6 text-2xl font-semibold">
              {t("resume.analyzingTitle")}
            </h1>
            <p className="text-muted-foreground mt-2">
              {t("resume.analyzingDescription")}
            </p>
          </section>
        ) : ready ? (
          <section aria-labelledby="resume-summary-title">
            <div className="bg-primary/10 text-primary mb-5 grid size-12 place-items-center rounded-xl">
              <Sparkles aria-hidden="true" className="size-5" />
            </div>
            <h1 id="resume-summary-title" className="text-2xl font-semibold">
              {t("resume.summaryTitle")}
            </h1>
            <p className="text-muted-foreground mt-2">
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
            {error ? (
              <p role="alert" className="text-destructive mt-4 text-sm">
                {t(`resume.errors.${error}`)}
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
              className="mt-6 text-3xl font-semibold"
            >
              {t("resume.uploadTitle")}
            </h1>
            <p className="text-muted-foreground mx-auto mt-3 max-w-md leading-7">
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
            <Button
              className="mt-7 min-h-12 w-full text-base"
              onClick={() => inputRef.current?.click()}
            >
              <Upload aria-hidden="true" />
              {t("resume.uploadAction")}
            </Button>
            <p className="text-muted-foreground mt-3 text-xs">
              {t("resume.fileHint")}
            </p>
            {visibleResume?.status === "failed" || error ? (
              <p role="alert" className="text-destructive mt-4 text-sm">
                {t("resume.errors.upload")}
              </p>
            ) : null}
          </section>
        )}
      </motion.main>
    </AuthShell>
  );
}
