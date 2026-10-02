import { EducationNameInput } from "./education-name-input";
import { useId } from "react";
import { GraduationCap, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { CandidateQualifications } from "../../../convex/candidateQualifications";
import { Button } from "@/components/ui/button";
import { Choice, SelectInput } from "./profile-form-fields";
import { educationDisplayName } from "./education-display";

const LEVELS = [
  "secondary",
  "certificate",
  "diploma",
  "associate",
  "bachelor",
  "master",
  "doctorate",
  "other",
] as const;
const STATUSES = ["in_progress", "completed"] as const;

export function QualificationsFields({
  value,
  onChange,
  error,
}: {
  value: CandidateQualifications;
  onChange: (value: CandidateQualifications) => void;
  error?: string;
}) {
  const { t } = useTranslation();
  const id = useId();
  const reduceMotion = useReducedMotion();
  const changeEducation = (
    index: number,
    patch: Partial<CandidateQualifications["education"][number]>,
  ) => {
    onChange({
      ...value,
      education: value.education.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              status:
                item.status === "in_progress" ? "in_progress" : "completed",
              ...patch,
            }
          : item,
      ),
    });
  };
  return (
    <section aria-labelledby={id + "-title"} className="space-y-4">
      <h3
        id={id + "-title"}
        className="flex items-center gap-2 text-sm font-medium"
      >
        <GraduationCap
          aria-hidden="true"
          className="text-muted-foreground size-4"
        />
        {t("qualifications.title")}
      </h3>
      {value.education.length ? (
        <div className="bg-muted/35 divide-border divide-y rounded-2xl px-4">
          <AnimatePresence initial={false}>
            {value.education.map((item, index) => (
              <motion.fieldset
                key={index}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.15 }}
                className="min-w-0 space-y-4 py-4"
              >
                <legend className="sr-only">
                  {t("qualifications.entry", { number: index + 1 })}
                </legend>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 sm:grid-cols-[minmax(9rem,1fr)_minmax(12rem,1.2fr)_auto]">
                  <div>
                    <label
                      htmlFor={id + "-level-" + index}
                      className="mb-2 block text-sm font-medium"
                    >
                      {t("qualifications.level")}
                    </label>
                    <SelectInput
                      id={id + "-level-" + index}
                      value={item.level}
                      onChange={(event) =>
                        changeEducation(index, {
                          level: event.target.value as typeof item.level,
                        })
                      }
                    >
                      {LEVELS.map((level) => (
                        <option key={level} value={level}>
                          {t("qualifications.levels." + level)}
                        </option>
                      ))}
                    </SelectInput>
                  </div>
                  <fieldset className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto">
                    <legend className="mb-2 text-sm font-medium">
                      {t("qualifications.completion")}
                    </legend>
                    <div
                      className="grid grid-cols-2 gap-2"
                      aria-describedby={error ? id + "-error" : undefined}
                    >
                      {STATUSES.map((status) => (
                        <Choice
                          key={status}
                          type="radio"
                          name={id + "-status-" + index}
                          value={status}
                          checked={
                            (item.status === "in_progress"
                              ? "in_progress"
                              : "completed") === status
                          }
                          onChange={() => changeEducation(index, { status })}
                        >
                          {t("qualifications.statuses." + status)}
                        </Choice>
                      ))}
                    </div>
                  </fieldset>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive col-start-2 row-start-1 justify-self-end sm:col-start-auto sm:row-start-auto"
                    aria-label={t("qualifications.removeEntry", {
                      number: index + 1,
                    })}
                    onClick={() =>
                      onChange({
                        ...value,
                        education: value.education.filter(
                          (_, itemIndex) => itemIndex !== index,
                        ),
                      })
                    }
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
                <EducationNameInput
                  value={educationDisplayName(item)}
                  onChange={(name) =>
                    changeEducation(index, {
                      credential: name || null,
                      field: null,
                    })
                  }
                />
              </motion.fieldset>
            ))}
          </AnimatePresence>
        </div>
      ) : null}
      {value.education.length < 10 ? (
        <Button
          type="button"
          variant="outline"
          className="border-primary/20 text-primary hover:bg-primary/5 min-h-11 w-full px-4 shadow-xs sm:w-auto"
          onClick={() =>
            onChange({
              ...value,
              education: [
                ...value.education,
                {
                  level: "other",
                  status: "completed",
                  field: null,
                  credential: null,
                },
              ],
            })
          }
        >
          <Plus aria-hidden="true" className="size-4" />
          {t("qualifications.add")}
        </Button>
      ) : null}
      {error ? (
        <p id={id + "-error"} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </section>
  );
}
