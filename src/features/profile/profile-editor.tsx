import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { Check, LoaderCircle, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/product-layout";
import { StepFour, StepOne, StepThree, StepTwo } from "./onboarding-screen";
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
  onCancel,
  onSaved,
  onDirtyChange,
}: {
  data: CurrentProfile;
  section: EditableProfileSection;
  onCancel: () => void;
  onSaved: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { t } = useTranslation();
  const saveProfile = useMutation(api.candidateProfiles.saveCurrent);
  const [draft, setDraft] = useState(() => createProfileDraft(data));
  const [baseline] = useState(() =>
    JSON.stringify(profileDraftToValues(createProfileDraft(data))),
  );
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const isDirty = baseline !== JSON.stringify(profileDraftToValues(draft));

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

  const cancel = () => {
    if (!isDirty || window.confirm(t("dashboard.discardChanges"))) onCancel();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submittingRef.current) return;
    const allErrors: ProfileErrors = {};
    for (let step = 1; step <= PROFILE_LIMITS.steps; step++) {
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
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={cancel}
            disabled={isSubmitting}
          >
            <X aria-hidden="true" />
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={isSubmitting || !isDirty}>
            {isSubmitting ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <Check aria-hidden="true" />
            )}
            {t("dashboard.saveProfile")}
          </Button>
        </div>
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
  );
}
