import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { Check, LoaderCircle, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/product-layout";
import { StepFour, StepOne, StepThree, StepTwo } from "./onboarding-screen";
import { DiscardProfileChangesDialog } from "./discard-profile-changes-dialog";
import { getProfileServerError } from "./profile-server-error";
import {
  createProfileDraft,
  PROFILE_LIMITS,
  profileDraftToValues,
  type CurrentProfile,
  type ProfileErrors,
  validateProfileStep,
} from "./profile-types";

export type EditableProfileSection =
  "professional" | "preferences" | "languages";

const sectionCopy = {
  professional: {
    title: "profileOverview.editProfessional",
    description: "profileOverview.editProfessionalDescription",
  },
  preferences: {
    title: "profileOverview.editPreferences",
    description: "profileOverview.editPreferencesDescription",
  },
  languages: {
    title: "profileOverview.editLanguages",
    description: "profileOverview.editLanguagesDescription",
  },
} as const;

export function ProfileEditor({
  data,
  section,
  onSaved,
  onDirtyChange,
}: {
  data: CurrentProfile;
  section: EditableProfileSection;
  onSaved: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { t } = useTranslation();
  const saveProfile = useMutation(api.candidateProfiles.saveCurrent);
  const [draft, setDraft] = useState(() => createProfileDraft(data));
  const [savedDraft, setSavedDraft] = useState(() => createProfileDraft(data));
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const submittingRef = useRef(false);
  const isDirty =
    JSON.stringify(profileDraftToValues(savedDraft)) !==
    JSON.stringify(profileDraftToValues(draft));

  useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  const discardChanges = () => {
    setDraft(savedDraft);
    setErrors({});
    setServerError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submittingRef.current) return;
    const allErrors: ProfileErrors = {};
    const steps =
      section === "professional"
        ? [1, 2]
        : section === "preferences"
          ? [3]
          : [4];
    for (const step of steps) {
      Object.assign(allErrors, validateProfileStep(step, draft));
    }
    setErrors(allErrors);
    setServerError(null);
    if (Object.keys(allErrors).length) {
      setServerError(t("profileOverview.reviewErrors"));
      return;
    }
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      await saveProfile({
        values: profileDraftToValues(draft),
        onboardingStep: PROFILE_LIMITS.steps,
        complete: true,
      });
      setSavedDraft(draft);
      onSaved();
    } catch (error) {
      const parsed = getProfileServerError(error);
      setServerError(t(parsed.key));
      if (parsed.field) {
        setErrors((current) => ({
          ...current,
          [parsed.field]: parsed.key,
        }));
      }
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <form onSubmit={(event) => void submit(event)} noValidate>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">
              {t(sectionCopy[section].title)}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm leading-6">
              {t(sectionCopy[section].description)}
            </p>
          </div>
          {isDirty ? (
            <div className="animate-in fade-in zoom-in-95 flex gap-2 duration-150 motion-reduce:animate-none">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDiscardDialogOpen(true)}
                disabled={isSubmitting}
              >
                <X aria-hidden="true" />
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <LoaderCircle aria-hidden="true" className="animate-spin" />
                ) : (
                  <Check aria-hidden="true" />
                )}
                {t("dashboard.saveProfile")}
              </Button>
            </div>
          ) : null}
        </div>

        <fieldset disabled={isSubmitting}>
          <Surface>
            {section === "professional" ? (
              <div className="space-y-7">
                <StepOne
                  draft={draft}
                  setDraft={setDraft}
                  errors={errors}
                  identity={data.identity}
                />
                <div className="border-border border-t pt-7">
                  <StepTwo draft={draft} setDraft={setDraft} errors={errors} />
                </div>
              </div>
            ) : null}
            {section === "preferences" ? (
              <StepThree draft={draft} setDraft={setDraft} errors={errors} />
            ) : null}
            {section === "languages" ? (
              <StepFour
                draft={draft}
                setDraft={setDraft}
                errors={errors}
                showReady={false}
              />
            ) : null}
          </Surface>
        </fieldset>
        <div aria-live="polite" className="min-h-10 pt-4 text-sm">
          {serverError ? (
            <p role="alert" className="text-destructive">
              {serverError}
            </p>
          ) : null}
        </div>
      </form>
      <DiscardProfileChangesDialog
        open={discardDialogOpen}
        onOpenChange={setDiscardDialogOpen}
        onDiscard={discardChanges}
      />
    </>
  );
}
