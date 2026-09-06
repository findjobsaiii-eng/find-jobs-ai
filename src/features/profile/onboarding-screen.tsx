import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { ConvexError } from "convex/values";
import { useMutation } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LoaderCircle,
  LogOut,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/features/auth/auth-shell";
import { cn } from "@/lib/utils";
import {
  Choice,
  ChoiceGroup,
  TextareaField,
  TextField,
} from "./profile-form-fields";
import {
  createProfileDraft,
  EMPLOYMENT_TYPES,
  getInitialStep,
  LANGUAGE_PROFICIENCIES,
  LOCATION_RADIUS_OPTIONS_KM,
  PROFILE_LIMITS,
  profileDraftToValues,
  type CurrentProfile,
  type EmploymentType,
  type LanguageCode,
  type ProfileDraft,
  type ProfileErrors,
  type ProfileField,
  validateProfileStep,
  WORK_ARRANGEMENTS,
  type WorkArrangement,
  SUPPORTED_LANGUAGES,
} from "./profile-types";
import { GooglePlacesMultiSelect } from "./google-places-multi-select";
import { CatalogMultiSelect } from "./reference-multi-select";

const FIELD_STEP: Record<ProfileField, number> = {
  preferredDisplayName: 1,
  targetJobTitles: 1,
  professionalSummary: 2,
  yearsOfExperience: 2,
  skills: 2,
  preferredLocations: 3,
  locationRadiusKm: 3,
  workArrangements: 3,
  employmentTypes: 3,
  minimumMonthlySalaryIls: 3,
  languages: 4,
};

function getServerError(error: unknown) {
  if (
    !(error instanceof ConvexError) ||
    typeof error.data !== "object" ||
    !error.data
  ) {
    return { key: "onboarding.errors.save", field: null } as const;
  }
  const data = error.data as { code?: unknown; field?: unknown };
  if (data.code === "UNAUTHENTICATED") {
    return { key: "onboarding.errors.authentication", field: null } as const;
  }
  if (data.code === "MISSING_GOOGLE_EMAIL") {
    return { key: "onboarding.errors.googleEmail", field: null } as const;
  }
  if (
    data.code === "VALIDATION_ERROR" &&
    typeof data.field === "string" &&
    data.field in FIELD_STEP
  ) {
    return {
      key: "onboarding.errors.reviewFields",
      field: data.field as ProfileField,
    } as const;
  }
  return { key: "onboarding.errors.save", field: null } as const;
}

type StepProps = {
  draft: ProfileDraft;
  setDraft: Dispatch<SetStateAction<ProfileDraft>>;
  errors: ProfileErrors;
};

function StepOne({
  draft,
  setDraft,
  errors,
  identity,
}: StepProps & { identity: CurrentProfile["identity"] }) {
  const { t } = useTranslation();
  const fallbackInitial =
    (identity.googleDisplayName ?? identity.email ?? "?")
      .trim()
      .charAt(0)
      .toUpperCase() || "?";
  return (
    <div className="space-y-6">
      <div className="bg-muted/60 flex items-center gap-4 rounded-2xl p-4">
        {identity.profileImage ? (
          <img
            src={identity.profileImage}
            alt=""
            referrerPolicy="no-referrer"
            className="size-12 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="bg-primary/10 text-primary grid size-12 place-items-center rounded-full font-semibold"
          >
            {fallbackInitial}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate font-medium">
            {identity.googleDisplayName ?? t("onboarding.googleAccount")}
          </p>
          <p className="text-muted-foreground truncate text-sm">
            {identity.email ?? t("onboarding.emailUnavailable")}
          </p>
        </div>
        <span className="text-muted-foreground ms-auto hidden text-xs sm:block">
          {t("onboarding.fromGoogle")}
        </span>
      </div>
      <TextField
        label={t("onboarding.fields.displayName")}
        value={draft.preferredDisplayName}
        onChange={(event) =>
          setDraft((current) => ({
            ...current,
            preferredDisplayName: event.target.value,
          }))
        }
        maxLength={PROFILE_LIMITS.preferredDisplayName.max}
        autoComplete="name"
        error={errors.preferredDisplayName && t(errors.preferredDisplayName)}
      />
      <CatalogMultiSelect
        kind="jobTitle"
        label={t("onboarding.fields.targetJobTitles")}
        hint={t("onboarding.hints.targetJobTitles")}
        placeholder={t("onboarding.placeholders.targetJobTitle")}
        values={draft.targetJobTitles}
        onChange={(targetJobTitles) =>
          setDraft((current) => ({ ...current, targetJobTitles }))
        }
        maxItems={PROFILE_LIMITS.targetJobTitles.max}
        error={errors.targetJobTitles && t(errors.targetJobTitles)}
      />
    </div>
  );
}

function StepTwo({ draft, setDraft, errors }: StepProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <TextareaField
        label={t("onboarding.fields.summary")}
        hint={t("onboarding.hints.summary", {
          min: PROFILE_LIMITS.professionalSummary.min,
        })}
        placeholder={t("onboarding.placeholders.summary")}
        value={draft.professionalSummary}
        onChange={(professionalSummary) =>
          setDraft((current) => ({ ...current, professionalSummary }))
        }
        maxLength={PROFILE_LIMITS.professionalSummary.max}
        error={errors.professionalSummary && t(errors.professionalSummary)}
      />
      <TextField
        label={t("onboarding.fields.years")}
        type="number"
        inputMode="numeric"
        min={PROFILE_LIMITS.yearsOfExperience.min}
        max={PROFILE_LIMITS.yearsOfExperience.max}
        value={draft.yearsOfExperience}
        onChange={(event) =>
          setDraft((current) => ({
            ...current,
            yearsOfExperience: event.target.value,
          }))
        }
        error={errors.yearsOfExperience && t(errors.yearsOfExperience)}
      />
      <CatalogMultiSelect
        kind="skill"
        label={t("onboarding.fields.skills")}
        hint={t("onboarding.hints.skills")}
        placeholder={t("onboarding.placeholders.skill")}
        values={draft.skills}
        onChange={(skills) => setDraft((current) => ({ ...current, skills }))}
        maxItems={PROFILE_LIMITS.skills.max}
        error={errors.skills && t(errors.skills)}
      />
    </div>
  );
}

function StepThree({ draft, setDraft, errors }: StepProps) {
  const { t } = useTranslation();
  const primaryLocation = draft.preferredLocations[0];
  const toggleWorkArrangement = (value: WorkArrangement) => {
    setDraft((current) => ({
      ...current,
      workArrangements: current.workArrangements.includes(value)
        ? current.workArrangements.filter((item) => item !== value)
        : [...current.workArrangements, value],
    }));
  };
  const toggleEmploymentType = (value: EmploymentType) => {
    setDraft((current) => ({
      ...current,
      employmentTypes: current.employmentTypes.includes(value)
        ? current.employmentTypes.filter((item) => item !== value)
        : [...current.employmentTypes, value],
    }));
  };
  return (
    <div className="space-y-6">
      <GooglePlacesMultiSelect
        label={t("onboarding.fields.locations")}
        hint={t("onboarding.hints.locations")}
        placeholder={t("onboarding.placeholders.location")}
        values={draft.preferredLocations}
        onChange={(preferredLocations) =>
          setDraft((current) => ({ ...current, preferredLocations }))
        }
        radiusKm={draft.locationRadiusKm}
        error={errors.preferredLocations && t(errors.preferredLocations)}
      />
      {primaryLocation ? (
        <fieldset>
          <legend className="text-sm font-medium">
            {t("onboarding.fields.locationRadius")}
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {LOCATION_RADIUS_OPTIONS_KM.map((radius) => {
              const selected = draft.locationRadiusKm === radius;
              return (
                <button
                  key={radius}
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      locationRadiusKm: radius,
                    }))
                  }
                  className={cn(
                    "border-input bg-background hover:bg-muted focus-visible:border-ring focus-visible:ring-ring/40 flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-3",
                    selected &&
                      "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
                  )}
                >
                  {selected ? <Check aria-hidden="true" /> : null}
                  {t("onboarding.location.radiusOption", { radius })}
                </button>
              );
            })}
          </div>
          <p
            className="text-muted-foreground mt-2 text-sm leading-6"
            aria-live="polite"
          >
            {t("onboarding.location.searchSummary", {
              radius: draft.locationRadiusKm,
              location:
                primaryLocation.label || t("onboarding.savedLocationFallback"),
            })}
          </p>
          {errors.locationRadiusKm ? (
            <p className="text-destructive mt-1 text-sm" role="alert">
              {t(errors.locationRadiusKm)}
            </p>
          ) : null}
        </fieldset>
      ) : null}
      <ChoiceGroup
        label={t("onboarding.fields.workArrangement")}
        hint={t("onboarding.hints.multipleChoice")}
        error={errors.workArrangements && t(errors.workArrangements)}
      >
        {WORK_ARRANGEMENTS.map((value) => (
          <Choice
            key={value}
            type="checkbox"
            name="work-arrangement"
            value={value}
            checked={draft.workArrangements.includes(value)}
            onChange={() => toggleWorkArrangement(value)}
          >
            {t(`onboarding.options.workArrangement.${value}`)}
          </Choice>
        ))}
      </ChoiceGroup>
      <ChoiceGroup
        label={t("onboarding.fields.employmentTypes")}
        hint={t("onboarding.hints.multipleChoice")}
        error={errors.employmentTypes && t(errors.employmentTypes)}
      >
        {EMPLOYMENT_TYPES.map((value) => (
          <Choice
            key={value}
            type="checkbox"
            name="employment-types"
            value={value}
            checked={draft.employmentTypes.includes(value)}
            onChange={() => toggleEmploymentType(value)}
          >
            {t(`onboarding.options.employmentType.${value}`)}
          </Choice>
        ))}
      </ChoiceGroup>
      <TextField
        label={t("onboarding.fields.salary")}
        hint={t("onboarding.hints.salary")}
        type="number"
        inputMode="numeric"
        min={PROFILE_LIMITS.minimumMonthlySalaryIls.min}
        max={PROFILE_LIMITS.minimumMonthlySalaryIls.max}
        step={500}
        value={draft.minimumMonthlySalaryIls}
        onChange={(event) =>
          setDraft((current) => ({
            ...current,
            minimumMonthlySalaryIls: event.target.value,
          }))
        }
        error={
          errors.minimumMonthlySalaryIls && t(errors.minimumMonthlySalaryIls)
        }
      />
    </div>
  );
}

function StepFour({ draft, setDraft, errors }: StepProps) {
  const { t } = useTranslation();
  const availableLanguages = SUPPORTED_LANGUAGES.filter(
    (code) =>
      !draft.languages.some((language) => language.languageCode === code),
  );
  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm leading-6">
        {t("onboarding.hints.languages")}
      </p>
      <div className="space-y-3">
        {draft.languages.map((language) => {
          const id = `proficiency-${language.languageCode}`;
          return (
            <div
              key={language.languageCode}
              className="border-border grid items-end gap-3 rounded-xl border p-3 sm:grid-cols-[minmax(8rem,1fr)_minmax(11rem,1.4fr)_auto]"
            >
              <div>
                <p className="mb-2 text-sm font-medium">
                  {t(`onboarding.options.languages.${language.languageCode}`)}
                </p>
                <span className="text-muted-foreground text-xs">
                  {language.languageCode.toUpperCase()}
                </span>
              </div>
              <div>
                <label htmlFor={id} className="mb-2 block text-sm font-medium">
                  {t("onboarding.fields.proficiency")}
                </label>
                <select
                  id={id}
                  value={language.proficiency}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      languages: current.languages.map((item) =>
                        item.languageCode === language.languageCode
                          ? {
                              ...item,
                              proficiency: event.target
                                .value as typeof language.proficiency,
                            }
                          : item,
                      ),
                    }))
                  }
                  aria-invalid={Boolean(errors.languages)}
                  className="border-input bg-background focus:border-ring focus:ring-ring/30 h-11 w-full rounded-xl border px-3 text-sm outline-none focus:ring-3"
                >
                  <option value="">
                    {t("onboarding.placeholders.proficiency")}
                  </option>
                  {LANGUAGE_PROFICIENCIES.map((option) => (
                    <option key={option} value={option}>
                      {t(`onboarding.options.proficiency.${option}`)}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    languages: current.languages.filter(
                      (item) => item.languageCode !== language.languageCode,
                    ),
                  }))
                }
                aria-label={t("onboarding.removeLanguage", {
                  language: t(
                    `onboarding.options.languages.${language.languageCode}`,
                  ),
                })}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          );
        })}
        {availableLanguages.length > 0 ? (
          <select
            value=""
            onChange={(event) => {
              const languageCode = event.target.value as LanguageCode;
              if (!languageCode) return;
              setDraft((current) => ({
                ...current,
                languages: [
                  ...current.languages,
                  { languageCode, proficiency: "" },
                ],
              }));
            }}
            className="border-input bg-background focus:border-ring focus:ring-ring/30 h-11 w-full rounded-xl border px-3 text-sm outline-none focus:ring-3"
            aria-label={t("onboarding.addLanguage")}
          >
            <option value="">{t("onboarding.addLanguage")}</option>
            {availableLanguages.map((code) => (
              <option key={code} value={code}>
                {t(`onboarding.options.languages.${code}`)}
              </option>
            ))}
          </select>
        ) : null}
        {errors.languages ? (
          <p className="text-destructive text-sm" role="alert">
            {t(errors.languages)}
          </p>
        ) : null}
      </div>
      <div className="border-border bg-muted/40 rounded-2xl border p-4">
        <p className="font-medium">{t("onboarding.readyTitle")}</p>
        <p className="text-muted-foreground mt-1 text-sm leading-6">
          {t("onboarding.readyDescription")}
        </p>
      </div>
    </div>
  );
}

export function OnboardingScreen({
  initialData,
}: {
  initialData: CurrentProfile;
}) {
  const { i18n, t } = useTranslation();
  const { signOut } = useAuthActions();
  const saveProfile = useMutation(api.candidateProfiles.saveCurrent);
  const [draft, setDraft] = useState(() => createProfileDraft(initialData));
  const [step, setStep] = useState(() => getInitialStep(initialData));
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [saved, setSaved] = useState(Boolean(initialData.profile));
  const headingRef = useRef<HTMLHeadingElement>(null);
  const submittingRef = useRef(false);
  const signingOutRef = useRef(false);
  const isRtl = i18n.dir() === "rtl";

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const save = async (nextStep: number, complete: boolean) => {
    if (submittingRef.current) return false;
    submittingRef.current = true;
    setIsSubmitting(true);
    setServerError(null);
    setSaved(false);
    try {
      await saveProfile({
        values: profileDraftToValues(draft),
        onboardingStep: nextStep,
        complete,
      });
      setSaved(true);
      return true;
    } catch (error) {
      const parsed = getServerError(error);
      setServerError(t(parsed.key));
      if (parsed.field) {
        setErrors((current) => ({
          ...current,
          [parsed.field]: parsed.key,
        }));
        setStep(FIELD_STEP[parsed.field]);
      }
      return false;
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors = validateProfileStep(step, draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    if (step < PROFILE_LIMITS.steps) {
      const nextStep = step + 1;
      if (await save(nextStep, false)) setStep(nextStep);
      return;
    }
    await save(PROFILE_LIMITS.steps, true);
  };

  const handleSignOut = async () => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    setIsSigningOut(true);
    setServerError(null);
    try {
      await signOut();
    } catch {
      setServerError(t("auth.signOutError"));
      signingOutRef.current = false;
      setIsSigningOut(false);
    }
  };

  const stepContent =
    step === 1 ? (
      <StepOne
        draft={draft}
        setDraft={setDraft}
        errors={errors}
        identity={initialData.identity}
      />
    ) : step === 2 ? (
      <StepTwo draft={draft} setDraft={setDraft} errors={errors} />
    ) : step === 3 ? (
      <StepThree draft={draft} setDraft={setDraft} errors={errors} />
    ) : (
      <StepFour draft={draft} setDraft={setDraft} errors={errors} />
    );

  return (
    <AuthShell>
      <section className="w-full max-w-3xl" aria-labelledby="onboarding-title">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-muted-foreground mb-2 flex items-center justify-between text-xs font-medium">
              <span>
                {t("onboarding.progress", {
                  current: step,
                  total: PROFILE_LIMITS.steps,
                })}
              </span>
              <span>{Math.round((step / PROFILE_LIMITS.steps) * 100)}%</span>
            </div>
            <div
              className="bg-muted h-1.5 overflow-hidden rounded-full"
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={PROFILE_LIMITS.steps}
              aria-valuenow={step}
              aria-label={t("onboarding.progressLabel")}
            >
              <motion.div
                className="bg-primary h-full w-full rounded-full"
                style={{ transformOrigin: isRtl ? "right" : "left" }}
                animate={{ scaleX: step / PROFILE_LIMITS.steps }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              />
            </div>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => void handleSignOut()}
            disabled={isSigningOut || isSubmitting}
            aria-label={t("auth.signOut")}
          >
            {isSigningOut ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <LogOut aria-hidden="true" />
            )}
          </Button>
        </div>

        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="bg-card border-border rounded-3xl border p-5 shadow-sm sm:p-8"
          noValidate
        >
          <div className="mb-7">
            <p className="text-primary text-sm font-medium">
              {t(`onboarding.steps.${step}.eyebrow`)}
            </p>
            <h1
              ref={headingRef}
              tabIndex={-1}
              id="onboarding-title"
              className="mt-1 text-2xl font-semibold tracking-tight outline-none sm:text-3xl"
            >
              {t(`onboarding.steps.${step}.title`)}
            </h1>
            <p className="text-muted-foreground mt-2 leading-6">
              {t(`onboarding.steps.${step}.description`)}
            </p>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, x: isRtl ? -12 : 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: isRtl ? 12 : -12 }}
              transition={{ duration: 0.2 }}
            >
              {stepContent}
            </motion.div>
          </AnimatePresence>

          <div aria-live="polite" className="min-h-8 pt-4 text-sm">
            {serverError ? (
              <p className="text-destructive">{serverError}</p>
            ) : saved ? (
              <p className="text-muted-foreground inline-flex items-center gap-1.5">
                <Check aria-hidden="true" className="text-primary size-4" />
                {t("onboarding.saved")}
              </p>
            ) : null}
          </div>

          <div className="border-border mt-2 flex flex-wrap items-center gap-2 border-t pt-5">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setErrors({});
                setServerError(null);
                setStep((current) => Math.max(1, current - 1));
              }}
              disabled={step === 1 || isSubmitting}
            >
              {isRtl ? (
                <ArrowRight aria-hidden="true" />
              ) : (
                <ArrowLeft aria-hidden="true" />
              )}
              {t("onboarding.back")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="ms-auto"
              onClick={() => void save(step, false)}
              disabled={isSubmitting}
            >
              {t("onboarding.saveDraft")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : step === PROFILE_LIMITS.steps ? (
                <Check aria-hidden="true" />
              ) : null}
              {step === PROFILE_LIMITS.steps
                ? t("onboarding.finish")
                : t("onboarding.continue")}
              {step < PROFILE_LIMITS.steps ? (
                isRtl ? (
                  <ArrowLeft aria-hidden="true" />
                ) : (
                  <ArrowRight aria-hidden="true" />
                )
              ) : null}
            </Button>
          </div>
        </form>
      </section>
    </AuthShell>
  );
}
