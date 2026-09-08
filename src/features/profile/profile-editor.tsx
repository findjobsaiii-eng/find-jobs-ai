import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { Check, LoaderCircle, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  PageHeader,
  SectionHeader,
  Surface,
} from "@/components/ui/product-layout";
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

export function ProfileEditor({
  data,
  onCancel,
  onSaved,
}: {
  data: CurrentProfile;
  onCancel: () => void;
  onSaved: () => void;
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
    <div>
      <PageHeader
        title={t("profileOverview.editTitle")}
        description={t("profileOverview.editDescription")}
        actions={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={cancel}
              disabled={isSubmitting}
            >
              <X aria-hidden="true" />
              {t("common.cancel")}
            </Button>
            <Button type="submit" form="profile-editor" disabled={isSubmitting}>
              {isSubmitting ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : (
                <Check aria-hidden="true" />
              )}
              {t("dashboard.saveProfile")}
            </Button>
          </>
        }
      />
      <form
        id="profile-editor"
        onSubmit={(event) => void submit(event)}
        noValidate
      >
        <fieldset disabled={isSubmitting} className="grid gap-5">
          <Surface>
            <SectionHeader
              title={t("profileOverview.editProfessional")}
              description={t("profileOverview.editProfessionalDescription")}
            />
            <StepOne
              draft={draft}
              setDraft={setDraft}
              errors={errors}
              identity={data.identity}
            />
            <div className="border-border mt-7 border-t pt-7">
              <StepTwo draft={draft} setDraft={setDraft} errors={errors} />
            </div>
          </Surface>
          <Surface>
            <SectionHeader
              title={t("profileOverview.editPreferences")}
              description={t("profileOverview.editPreferencesDescription")}
            />
            <StepThree draft={draft} setDraft={setDraft} errors={errors} />
          </Surface>
          <Surface>
            <SectionHeader
              title={t("profileOverview.editLanguages")}
              description={t("profileOverview.editLanguagesDescription")}
            />
            <StepFour
              draft={draft}
              setDraft={setDraft}
              errors={errors}
              showReady={false}
            />
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
    </div>
  );
}
