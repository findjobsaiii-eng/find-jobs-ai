import {
  useEffect,
  useId,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import Image from "next/image";
import { Popover } from "@base-ui/react/popover";
import { useMutation } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  LoaderCircle,
  Minus,
  Plus,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/features/auth/auth-shell";
import {
  Choice,
  ChoiceGroup,
  SelectInput,
  TextareaField,
  TextField,
} from "./profile-form-fields";
import {
  createProfileDraft,
  EMPLOYMENT_TYPES,
  getInitialStep,
  LANGUAGE_PROFICIENCIES,
  LOCATION_RADIUS_MAX_KM,
  LOCATION_RADIUS_MIN_KM,
  LOCATION_RADIUS_STEP_KM,
  PROFILE_LIMITS,
  profileDraftToValues,
  type CurrentProfile,
  type EmploymentType,
  type LanguageCode,
  type ProfileDraft,
  type ProfileErrors,
  validateProfileStep,
  WORK_ARRANGEMENTS,
  type WorkArrangement,
  SUPPORTED_LANGUAGES,
} from "./profile-types";
import { GooglePlacesMultiSelect } from "./google-places-multi-select";
import {
  getProfileFieldStep,
  getProfileServerError,
} from "./profile-server-error";
import { CatalogMultiSelect } from "./reference-multi-select";
import { DiscardProfileChangesDialog } from "./discard-profile-changes-dialog";
import { ReplaceResumeDialog } from "./replace-resume-dialog";

type StepProps = {
  draft: ProfileDraft;
  setDraft: Dispatch<SetStateAction<ProfileDraft>>;
  errors: ProfileErrors;
};

const salaryFormatters = {
  en: new Intl.NumberFormat("en-IL"),
  he: new Intl.NumberFormat("he-IL"),
} as const;

export function StepOne({
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
          <Image
            src={identity.profileImage}
            alt=""
            width={48}
            height={48}
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

export function StepTwo({ draft, setDraft, errors }: StepProps) {
  const { t } = useTranslation();
  const experienceInputId = useId();
  const experienceErrorId = `${experienceInputId}-error`;
  const yearsOfExperience = Number(draft.yearsOfExperience || 0);
  const changeYearsOfExperience = (change: number) => {
    setDraft((current) => {
      const currentValue = Number(current.yearsOfExperience || 0);
      const nextValue = Math.min(
        PROFILE_LIMITS.yearsOfExperience.max,
        Math.max(PROFILE_LIMITS.yearsOfExperience.min, currentValue + change),
      );
      return { ...current, yearsOfExperience: String(nextValue) };
    });
  };
  return (
    <div className="space-y-6">
      <TextareaField
        label={t("onboarding.fields.summary")}
        placeholder={t("onboarding.placeholders.summary")}
        value={draft.professionalSummary}
        onChange={(professionalSummary) =>
          setDraft((current) => ({ ...current, professionalSummary }))
        }
        maxLength={PROFILE_LIMITS.professionalSummary.max}
        error={errors.professionalSummary && t(errors.professionalSummary)}
      />
      <div>
        <label
          htmlFor={experienceInputId}
          className="mb-2 block text-sm font-medium"
        >
          {t("onboarding.fields.years")}
        </label>
        <div className="border-input bg-background focus-within:border-ring focus-within:ring-ring/30 inline-flex h-11 items-center rounded-xl border p-1 transition-shadow focus-within:ring-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 rounded-lg"
            aria-label={t("onboarding.experience.decrease")}
            disabled={yearsOfExperience <= PROFILE_LIMITS.yearsOfExperience.min}
            onClick={() => changeYearsOfExperience(-1)}
          >
            <Minus aria-hidden="true" />
          </Button>
          <input
            id={experienceInputId}
            type="number"
            inputMode="numeric"
            min={PROFILE_LIMITS.yearsOfExperience.min}
            max={PROFILE_LIMITS.yearsOfExperience.max}
            step={1}
            value={draft.yearsOfExperience}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                yearsOfExperience: event.target.value,
              }))
            }
            aria-invalid={Boolean(errors.yearsOfExperience)}
            aria-describedby={
              errors.yearsOfExperience ? experienceErrorId : undefined
            }
            className="h-8 w-14 appearance-none bg-transparent text-center text-base font-semibold tabular-nums outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 rounded-lg"
            aria-label={t("onboarding.experience.increase")}
            disabled={yearsOfExperience >= PROFILE_LIMITS.yearsOfExperience.max}
            onClick={() => changeYearsOfExperience(1)}
          >
            <Plus aria-hidden="true" />
          </Button>
        </div>
        {errors.yearsOfExperience ? (
          <p
            id={experienceErrorId}
            className="text-destructive mt-1 text-sm"
            role="alert"
          >
            {t(errors.yearsOfExperience)}
          </p>
        ) : null}
      </div>
      <CatalogMultiSelect
        kind="skill"
        label={t("onboarding.fields.skills")}
        placeholder={t("onboarding.placeholders.skill")}
        values={draft.skills}
        onChange={(skills) => setDraft((current) => ({ ...current, skills }))}
        maxItems={PROFILE_LIMITS.skills.max}
        error={errors.skills && t(errors.skills)}
      />
    </div>
  );
}

export function StepThree({ draft, setDraft, errors }: StepProps) {
  const { i18n, t } = useTranslation();
  const radiusInputId = useId();
  const primaryLocation = draft.preferredLocations[0];
  const radiusProgress =
    ((draft.locationRadiusKm - LOCATION_RADIUS_MIN_KM) /
      (LOCATION_RADIUS_MAX_KM - LOCATION_RADIUS_MIN_KM)) *
    100;
  const formattedSalary = draft.minimumMonthlySalaryIls
    ? salaryFormatters[i18n.resolvedLanguage === "he" ? "he" : "en"].format(
        Number(draft.minimumMonthlySalaryIls),
      )
    : "";
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
          <legend className="w-full">
            <span className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">
                {t("onboarding.fields.locationRadius")}
              </span>
              <output
                htmlFor={radiusInputId}
                className="bg-primary/10 text-primary rounded-full px-3 py-1 text-sm font-semibold tabular-nums"
              >
                {t("onboarding.location.radiusOption", {
                  radius: draft.locationRadiusKm,
                })}
              </output>
            </span>
          </legend>
          <div className="mt-4 px-1">
            <input
              id={radiusInputId}
              type="range"
              min={LOCATION_RADIUS_MIN_KM}
              max={LOCATION_RADIUS_MAX_KM}
              step={LOCATION_RADIUS_STEP_KM}
              value={draft.locationRadiusKm}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  locationRadiusKm: Number(event.target.value),
                }))
              }
              aria-label={t("onboarding.fields.locationRadius")}
              aria-valuetext={t("onboarding.location.radiusOption", {
                radius: draft.locationRadiusKm,
              })}
              aria-invalid={Boolean(errors.locationRadiusKm)}
              style={{
                background: `linear-gradient(to ${i18n.dir() === "rtl" ? "left" : "right"}, var(--color-primary) 0%, var(--color-primary) ${radiusProgress}%, var(--color-muted) ${radiusProgress}%, var(--color-muted) 100%)`,
              }}
              className="focus-visible:ring-ring/40 [&::-moz-range-thumb]:border-background [&::-moz-range-thumb]:bg-primary [&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:bg-primary h-2 w-full cursor-pointer appearance-none rounded-full outline-none focus-visible:ring-3 [&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:shadow-md [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:shadow-md"
            />
            <div
              className="text-muted-foreground mt-2 flex justify-between text-xs tabular-nums"
              aria-hidden="true"
            >
              <span>
                {t("onboarding.location.radiusOption", {
                  radius: LOCATION_RADIUS_MIN_KM,
                })}
              </span>
              <span>
                {t("onboarding.location.radiusOption", {
                  radius: LOCATION_RADIUS_MAX_KM,
                })}
              </span>
            </div>
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
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={t("onboarding.placeholders.salary")}
        value={formattedSalary}
        onChange={(event) =>
          setDraft((current) => ({
            ...current,
            minimumMonthlySalaryIls: event.target.value
              .replace(/\D/gu, "")
              .replace(/^0+(?=\d)/u, "")
              .slice(0, 6),
          }))
        }
        error={
          errors.minimumMonthlySalaryIls && t(errors.minimumMonthlySalaryIls)
        }
      />
    </div>
  );
}

export function StepFour({
  draft,
  setDraft,
  errors,
  showReady = true,
}: StepProps & { showReady?: boolean }) {
  const { t } = useTranslation();
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const availableLanguages = SUPPORTED_LANGUAGES.filter(
    (code) =>
      !draft.languages.some((language) => language.languageCode === code),
  );
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="bg-muted/35 divide-border divide-y rounded-2xl px-4">
          {draft.languages.map((language) => {
            const id = `proficiency-${language.languageCode}`;
            return (
              <div
                key={language.languageCode}
                className="grid items-center gap-3 py-4 sm:grid-cols-[minmax(8rem,1fr)_minmax(11rem,1.4fr)_auto]"
              >
                <div>
                  <p className="text-sm font-semibold">
                    {t(`onboarding.options.languages.${language.languageCode}`)}
                  </p>
                  <span className="text-muted-foreground mt-0.5 block text-xs tracking-wide">
                    {language.languageCode.toUpperCase()}
                  </span>
                </div>
                <div>
                  <label
                    htmlFor={id}
                    className="mb-2 block text-sm font-medium"
                  >
                    {t("onboarding.fields.proficiency")}
                  </label>
                  <SelectInput
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
                  >
                    <option value="">
                      {t("onboarding.placeholders.proficiency")}
                    </option>
                    {LANGUAGE_PROFICIENCIES.map((option) => (
                      <option key={option} value={option}>
                        {t(`onboarding.options.proficiency.${option}`)}
                      </option>
                    ))}
                  </SelectInput>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive justify-self-end"
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
        </div>
        {availableLanguages.length > 0 ? (
          <Popover.Root
            open={languageMenuOpen}
            onOpenChange={setLanguageMenuOpen}
          >
            <Popover.Trigger
              render={
                <Button
                  nativeButton
                  type="button"
                  variant="outline"
                  className="border-primary/20 text-primary hover:bg-primary/5 min-h-11 w-full justify-between px-4 shadow-xs sm:w-auto"
                />
              }
            >
              <span className="flex items-center gap-2">
                <Plus aria-hidden="true" className="size-4" />
                {t("onboarding.addLanguage")}
              </span>
              <ChevronDown aria-hidden="true" className="size-4" />
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Positioner
                side="bottom"
                align="start"
                sideOffset={8}
                collisionPadding={12}
                className="z-50"
              >
                <Popover.Popup className="bg-popover text-popover-foreground border-border max-h-[min(22rem,var(--available-height))] w-64 max-w-[calc(100vw-2rem)] origin-[var(--transform-origin)] overflow-y-auto rounded-2xl border p-2 text-start shadow-xl transition-[transform,opacity] duration-150 outline-none data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none">
                  <p className="px-3 py-2 text-sm font-semibold">
                    {t("onboarding.chooseLanguage")}
                  </p>
                  <div className="space-y-0.5">
                    {availableLanguages.map((code) => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => {
                          setDraft((current) => ({
                            ...current,
                            languages: [
                              ...current.languages,
                              {
                                languageCode: code as LanguageCode,
                                proficiency: "",
                              },
                            ],
                          }));
                          setLanguageMenuOpen(false);
                        }}
                        className="hover:bg-muted focus-visible:ring-ring/40 flex min-h-10 w-full items-center justify-between gap-3 rounded-xl px-3 text-start text-sm transition-colors outline-none focus-visible:ring-3 motion-reduce:transition-none"
                      >
                        <span>{t(`onboarding.options.languages.${code}`)}</span>
                        <span className="text-muted-foreground text-xs tracking-wide">
                          {code.toUpperCase()}
                        </span>
                      </button>
                    ))}
                  </div>
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>
        ) : null}
        {errors.languages ? (
          <p className="text-destructive text-sm" role="alert">
            {t(errors.languages)}
          </p>
        ) : null}
      </div>
      {showReady ? (
        <div className="border-border bg-muted/40 rounded-2xl border p-4">
          <p className="font-medium">{t("onboarding.readyTitle")}</p>
          <p className="text-muted-foreground mt-1 text-sm leading-6">
            {t("onboarding.readyDescription")}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function OnboardingScreen({
  initialData,
  editing,
  resumeReview = false,
  onBackToResume,
}: {
  initialData: CurrentProfile;
  resumeReview?: boolean;
  onBackToResume?: () => void;
  editing?: {
    onCancel: () => void;
    onSaved: () => void;
  };
}) {
  const { i18n, t } = useTranslation();
  const saveProfile = useMutation(api.candidateProfiles.saveCurrent);
  const [draft, setDraft] = useState(() => createProfileDraft(initialData));
  const [step, setStep] = useState(() =>
    editing ? 1 : getInitialStep(initialData),
  );
  const [baseline] = useState(() =>
    JSON.stringify(profileDraftToValues(createProfileDraft(initialData))),
  );
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saved, setSaved] = useState(Boolean(initialData.profile));
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [replaceResumeDialogOpen, setReplaceResumeDialogOpen] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const submittingRef = useRef(false);
  const isRtl = i18n.dir() === "rtl";
  const isDirty = baseline !== JSON.stringify(profileDraftToValues(draft));

  useEffect(() => {
    if (!editing || !isDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editing, isDirty]);

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
      const parsed = getProfileServerError(error);
      setServerError(t(parsed.key));
      if (parsed.field) {
        setErrors((current) => ({
          ...current,
          [parsed.field]: parsed.key,
        }));
        setStep(getProfileFieldStep(parsed.field));
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
      if (editing || (await save(nextStep, false))) setStep(nextStep);
      return;
    }
    if (editing) await saveEdits();
    else await save(PROFILE_LIMITS.steps, true);
  };

  const saveEdits = async () => {
    const allErrors: ProfileErrors = {};
    let firstInvalidStep = 0;
    for (let index = 1; index <= PROFILE_LIMITS.steps; index++) {
      const stepErrors = validateProfileStep(index, draft);
      Object.assign(allErrors, stepErrors);
      if (!firstInvalidStep && Object.keys(stepErrors).length)
        firstInvalidStep = index;
    }
    setErrors(allErrors);
    if (firstInvalidStep) {
      setStep(firstInvalidStep);
      return;
    }
    if (await save(PROFILE_LIMITS.steps, true)) editing?.onSaved();
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
    <AuthShell identity={editing ? undefined : initialData.identity}>
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
        </div>

        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="bg-card/96 border-border rounded-3xl border p-5 shadow-[var(--brand-shadow-preview)] backdrop-blur sm:p-8"
          noValidate
        >
          <div className="mb-7">
            <p className="text-primary text-sm font-medium">
              {t(
                resumeReview && step === 1
                  ? "onboarding.resumeReview.eyebrow"
                  : `onboarding.steps.${step}.eyebrow`,
              )}
            </p>
            <h1
              ref={headingRef}
              tabIndex={-1}
              id="onboarding-title"
              className="mt-1 text-2xl font-semibold tracking-tight text-balance outline-none sm:text-3xl"
            >
              {editing
                ? t("dashboard.editProfile")
                : t(
                    resumeReview && step === 1
                      ? "onboarding.resumeReview.title"
                      : `onboarding.steps.${step}.title`,
                  )}
            </h1>
            <p className="text-muted-foreground mt-2 leading-6 text-pretty">
              {t(
                resumeReview && step === 1
                  ? "onboarding.resumeReview.description"
                  : `onboarding.steps.${step}.description`,
              )}
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
              <fieldset disabled={isSubmitting}>{stepContent}</fieldset>
            </motion.div>
          </AnimatePresence>

          <div aria-live="polite" className="min-h-8 pt-4 text-sm">
            {serverError ? (
              <p className="text-destructive">{serverError}</p>
            ) : saved && !editing ? (
              <p className="text-muted-foreground inline-flex items-center gap-1.5">
                <Check aria-hidden="true" className="text-primary size-4" />
                {t("onboarding.saved")}
              </p>
            ) : null}
          </div>

          <div className="border-border mt-2 grid grid-cols-2 items-center gap-2 border-t pt-5 sm:flex sm:flex-wrap">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (step === 1 && onBackToResume) {
                  if (resumeReview) setReplaceResumeDialogOpen(true);
                  else onBackToResume();
                  return;
                }
                setErrors({});
                setServerError(null);
                setStep((current) => Math.max(1, current - 1));
              }}
              disabled={(step === 1 && !onBackToResume) || isSubmitting}
            >
              {isRtl ? (
                <ArrowRight aria-hidden="true" />
              ) : (
                <ArrowLeft aria-hidden="true" />
              )}
              {t(
                step === 1 && onBackToResume
                  ? "onboarding.backToResume"
                  : "onboarding.back",
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="sm:ms-auto"
              onClick={() =>
                editing ? void saveEdits() : void save(step, false)
              }
              disabled={isSubmitting}
            >
              {editing && isSubmitting ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : null}
              {t(editing ? "dashboard.saveProfile" : "onboarding.saveDraft")}
            </Button>
            {editing ? (
              <Button
                type="button"
                variant="ghost"
                disabled={isSubmitting}
                onClick={() => {
                  if (isDirty) setDiscardDialogOpen(true);
                  else editing.onCancel();
                }}
              >
                {t("dashboard.cancel")}
              </Button>
            ) : null}
            {!editing || step < PROFILE_LIMITS.steps ? (
              <Button
                type="submit"
                className="col-span-2 sm:col-auto"
                disabled={isSubmitting}
              >
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
            ) : null}
          </div>
        </form>
      </section>
      <DiscardProfileChangesDialog
        open={discardDialogOpen}
        onOpenChange={setDiscardDialogOpen}
        onDiscard={() => editing?.onCancel()}
      />
      {onBackToResume ? (
        <ReplaceResumeDialog
          open={replaceResumeDialogOpen}
          onOpenChange={setReplaceResumeDialogOpen}
          onConfirm={onBackToResume}
        />
      ) : null}
    </AuthShell>
  );
}
