import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { LoaderCircle } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StepOne, StepTwo, StepThree, StepFour } from "./onboarding-screen";
import {
  createProfileDraft,
  profileDraftToValues,
  validateProfileStep,
  type CurrentProfile,
  type ProfileErrors,
} from "./profile-types";
import { getProfileServerError } from "./profile-server-error";

function ProfileUpdateForm({
  data,
  resumeId,
  onClose,
}: {
  data: CurrentProfile;
  resumeId: Id<"resumeDocuments">;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const saveProfile = useMutation(api.candidateProfiles.saveCurrent);
  const [draft, setDraft] = useState(() => createProfileDraft(data));
  const [expectedUpdatedAt] = useState(data.profile!.updatedAt);
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    const nextErrors = validateProfileStep(step, draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    if (step < 4) {
      setStep(step + 1);
      return;
    }
    for (let index = 1; index <= 4; index++) {
      const stepErrors = validateProfileStep(index, draft);
      if (Object.keys(stepErrors).length) {
        setErrors(stepErrors);
        setStep(index);
        return;
      }
    }
    submitting.current = true;
    setSaving(true);
    setError(null);
    try {
      await saveProfile({
        values: {
          ...profileDraftToValues(draft),
          qualifications: draft.qualifications,
        },
        onboardingStep: 4,
        complete: true,
        resumeUpdate: { resumeId, expectedUpdatedAt },
      });
      onClose();
    } catch (cause) {
      setError(t(getProfileServerError(cause).key));
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };
  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <h3 ref={heading} tabIndex={-1} className="mb-5 font-medium outline-none">
        {t(`onboarding.steps.${step}.title`)}{" "}
        <span className="text-muted-foreground text-sm">
          {t("onboarding.progress", { current: step, total: 4 })}
        </span>
      </h3>
      <motion.fieldset
        key={step}
        disabled={saving}
        initial={reducedMotion ? false : { opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
      >
        {step === 1 ? (
          <StepOne
            draft={draft}
            setDraft={setDraft}
            errors={errors}
            identity={data.identity}
          />
        ) : step === 2 ? (
          <StepTwo draft={draft} setDraft={setDraft} errors={errors} />
        ) : step === 3 ? (
          <StepThree draft={draft} setDraft={setDraft} errors={errors} />
        ) : (
          <StepFour
            draft={draft}
            setDraft={setDraft}
            errors={errors}
            showReady={false}
          />
        )}
      </motion.fieldset>
      {error ? (
        <p role="alert" className="text-destructive mt-4 text-sm">
          {error}
        </p>
      ) : null}
      <div className="border-border mt-6 flex flex-wrap justify-end gap-2 border-t pt-4">
        <Button
          type="button"
          variant="ghost"
          disabled={saving}
          onClick={onClose}
        >
          {t("common.cancel")}
        </Button>
        {step > 1 ? (
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => setStep(step - 1)}
          >
            {t("onboarding.back")}
          </Button>
        ) : null}
        <Button type="submit" disabled={saving}>
          {saving ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" />
          ) : null}
          {t(
            step === 4 ? "resumeLibrary.approveProfile" : "onboarding.continue",
          )}
        </Button>
      </div>
    </form>
  );
}

export function ResumeProfileUpdateDialog({
  resumeId,
  onClose,
}: {
  resumeId: Id<"resumeDocuments">;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const data = useQuery(api.resumes.getProfileUpdateDraft, { resumeId });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90svh] overflow-y-auto sm:max-w-3xl"
        dir={i18n.dir()}
      >
        <DialogHeader>
          <DialogTitle>{t("resumeLibrary.updateProfile")}</DialogTitle>
          <DialogDescription>
            {t("resumeLibrary.reviewProfileDescription")}
          </DialogDescription>
        </DialogHeader>
        {data ? (
          <ProfileUpdateForm
            data={data}
            resumeId={resumeId}
            onClose={onClose}
          />
        ) : (
          <div role="status" className="flex justify-center gap-2 py-10">
            <LoaderCircle aria-hidden="true" className="animate-spin" />
            {t("resumeLibrary.loading")}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
