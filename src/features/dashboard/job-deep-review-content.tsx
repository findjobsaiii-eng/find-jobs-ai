import { useMemo, type ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  CircleHelp,
  FileCheck2,
  FileText,
  Globe,
  MapPin,
  PencilLine,
  Send,
  ShieldCheck,
  Target,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../../convex/_generated/api";
import { cn } from "@/lib/utils";
import { requirementLabel } from "./requirement-label";
import { salaryRangeScale } from "./salary-range-scale";

type FeedJob = FunctionReturnType<
  typeof api.jobDiscovery.listCurrentUserJobs
>["jobs"][number];
export type DeepReview = NonNullable<FeedJob["deepReview"]>;
export type ReviewJobFacts = Pick<
  FeedJob,
  | "locationText"
  | "locationNames"
  | "workArrangement"
  | "employmentType"
  | "activityConfidence"
  | "sourceUrl"
  | "salaryMin"
  | "salaryMax"
  | "salaryCurrency"
  | "salaryPeriod"
>;

const statusVisuals = {
  met: {
    icon: Check,
    className: "bg-success/10 text-success border-success/20",
    textClassName: "text-success",
  },
  gap: {
    icon: X,
    className: "bg-destructive/10 text-destructive border-destructive/20",
    textClassName: "text-destructive",
  },
  unknown: {
    icon: CircleHelp,
    className: "bg-warning/10 text-warning border-warning/20",
    textClassName: "text-warning",
  },
} as const;

export function DeepReviewContent({
  review,
  facts,
  unavailable,
}: {
  review: DeepReview;
  facts: ReviewJobFacts;
  unavailable: boolean;
}) {
  const { t } = useTranslation();
  const requirements = review.requirements ?? [];
  return (
    <div className="space-y-6 p-4 sm:space-y-7 sm:p-5">
      <div className="flex flex-col gap-3 @lg:flex-row @lg:items-start @lg:gap-5">
        <FitScore
          score={review.matchPercentage ?? 0}
          verdict={review.verdict}
        />
        <div className="min-w-0 flex-1 pt-1">
          <p className="text-foreground text-sm leading-relaxed text-pretty sm:text-base">
            {review.summary}
          </p>
          <JobFactTags facts={facts} unavailable={unavailable} />
        </div>
      </div>

      <SalaryRange facts={facts} estimate={review.salaryEstimate} />

      {requirements.length ? (
        <ReviewSection icon={ShieldCheck} title={t("jobReview.requirements")}>
          <div
            className="mb-4 flex flex-wrap gap-2"
            aria-label={t("jobReview.requirementOverview")}
          >
            {(["met", "gap", "unknown"] as const).map((status) => {
              const count = requirements.filter(
                (item) => item.status === status,
              ).length;
              return count ? (
                <FactTag
                  key={status}
                  icon={statusVisuals[status].icon}
                  className={statusVisuals[status].className}
                >
                  {t(`jobReview.requirementCount.${status}`, { count })}
                </FactTag>
              ) : null;
            })}
          </div>
          <div className="grid gap-4 @2xl:grid-cols-2">
            {(["must_have", "important", "minor"] as const).map(
              (importance) => {
                const items = requirements.filter(
                  (item) => item.importance === importance,
                );
                if (!items.length) return null;
                return (
                  <div
                    key={importance}
                    className={
                      importance === "must_have" ? "@2xl:col-span-2" : ""
                    }
                  >
                    <h5 className="text-muted-foreground mb-2 flex items-center gap-2 text-xs font-semibold">
                      {t(`jobReview.importance.${importance}`)}
                      <span className="bg-muted rounded-full px-1.5 py-0.5 text-[10px] tabular-nums">
                        {items.length}
                      </span>
                    </h5>
                    <ul
                      className={cn(
                        "grid gap-2",
                        importance === "must_have" && "@2xl:grid-cols-2",
                      )}
                    >
                      {items.map((item, index) => (
                        <RequirementRow
                          key={`${item.requirement}-${index}`}
                          item={item}
                        />
                      ))}
                    </ul>
                  </div>
                );
              },
            )}
          </div>
        </ReviewSection>
      ) : null}

      <ReviewSection icon={FileCheck2} title={t("jobReview.resume.heading")}>
        {review.resumeOptions?.length ? (
          <ul
            className="grid gap-2 @xl:grid-cols-2 @3xl:grid-cols-3"
            aria-label={t("jobReview.resume.compared")}
          >
            {review.resumeOptions.map((resume) => {
              const selected = resume.id === review.resumeId;
              return (
                <li
                  key={resume.id}
                  className={cn(
                    "relative flex min-w-0 items-center gap-3 rounded-xl border p-3 transition-colors",
                    selected
                      ? "border-success/40 bg-success/5"
                      : "border-border bg-card",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-12 w-10 shrink-0 place-items-center rounded-lg border",
                      selected
                        ? "border-success/20 bg-success/10 text-success"
                        : "border-border bg-muted text-muted-foreground",
                    )}
                  >
                    <FileText aria-hidden="true" className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium break-words">
                      {resume.name}
                    </p>
                    <span
                      className={cn(
                        "mt-1 inline-flex items-center gap-1 text-xs",
                        selected
                          ? "text-success font-medium"
                          : "text-muted-foreground",
                      )}
                    >
                      {selected ? (
                        <Check aria-hidden="true" className="size-3.5" />
                      ) : null}
                      {t(
                        selected
                          ? "jobReview.resume.recommended"
                          : "jobReview.resume.alternative",
                      )}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            {t("jobReview.resume.none")}
          </p>
        )}
        {review.resumeRationale ? (
          <p className="text-muted-foreground mt-3 text-sm leading-relaxed text-pretty">
            {review.resumeRationale}
          </p>
        ) : null}
        {review.resumeChanges?.length ? (
          <div className="mt-4">
            <h5 className="mb-2 text-xs font-semibold">
              {t("jobReview.resume.beforeApplying")}
            </h5>
            <ul className="space-y-2">
              {review.resumeChanges.map((change, index) => (
                <li key={`${change.section}-${index}`}>
                  <details className="group border-border bg-card rounded-xl border">
                    <summary className="focus-visible:ring-ring/40 flex cursor-pointer list-none items-start gap-2.5 rounded-xl p-3 outline-none focus-visible:ring-3 [&::-webkit-details-marker]:hidden">
                      <PencilLine
                        aria-hidden="true"
                        className="text-info mt-0.5 size-4 shrink-0"
                      />
                      <span className="min-w-0 flex-1 text-sm leading-relaxed">
                        <span className="text-muted-foreground me-2 text-xs">
                          {change.section}
                        </span>
                        {change.change}
                      </span>
                      <ChevronDown
                        aria-hidden="true"
                        className="text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                      />
                    </summary>
                    <p className="text-muted-foreground px-3 ps-9 pb-3 text-xs leading-relaxed">
                      {change.reason}
                    </p>
                  </details>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </ReviewSection>

      <ReviewSection icon={Send} title={t("jobReview.apply.heading")}>
        <div className="grid gap-2 @xl:grid-cols-2">
          <ApplicationRoute
            href={review.directApplicationUrl ?? facts.sourceUrl}
            icon={Send}
            recommended={!unavailable}
            disabled={unavailable}
            label={t(
              review.directApplicationUrl
                ? "jobReview.apply.direct"
                : "jobReview.apply.listing",
            )}
          />
          {review.companyWebsiteUrl ? (
            <ApplicationRoute
              href={review.companyWebsiteUrl}
              icon={Globe}
              label={t("jobReview.apply.company")}
            />
          ) : null}
        </div>
        {review.applicationNote ? (
          <details className="group mt-3">
            <summary className="text-muted-foreground focus-visible:ring-ring/40 flex w-fit cursor-pointer list-none items-center gap-1 rounded-md py-1 text-xs outline-none focus-visible:ring-3 [&::-webkit-details-marker]:hidden">
              {t("jobReview.apply.why")}
              <ChevronDown
                aria-hidden="true"
                className="size-3.5 transition-transform group-open:rotate-180 motion-reduce:transition-none"
              />
            </summary>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed text-pretty">
              {review.applicationNote}
            </p>
          </details>
        ) : null}
      </ReviewSection>

      {review.interviewFocus?.length ? (
        <ReviewSection icon={Target} title={t("jobReview.interviewFocus")}>
          <ul className="space-y-2">
            {review.interviewFocus.map((item, index) => (
              <li
                key={`${item}-${index}`}
                className="flex items-start gap-2.5 text-sm leading-relaxed"
              >
                <span
                  className="bg-info/10 text-info mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold tabular-nums"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </ReviewSection>
      ) : null}
    </div>
  );
}

function SalaryRange({
  facts,
  estimate,
}: {
  facts: ReviewJobFacts;
  estimate: DeepReview["salaryEstimate"];
}) {
  const { t, i18n } = useTranslation();
  const formatter = useMemo(
    () => new Intl.NumberFormat(i18n.language),
    [i18n.language],
  );
  const validAmount = (amount: number | null) =>
    amount !== null && Number.isFinite(amount) && amount > 0 ? amount : null;
  const publishedMin = validAmount(facts.salaryMin);
  const publishedMax = validAmount(facts.salaryMax);
  const isEstimate =
    publishedMin === null &&
    publishedMax === null &&
    estimate != null &&
    estimate.min > 0 &&
    estimate.max >= estimate.min;
  const min = isEstimate ? estimate.min : publishedMin;
  const max = isEstimate ? estimate.max : publishedMax;
  const known =
    (min !== null || max !== null) &&
    !(min !== null && max !== null && min > max);
  const currency = isEstimate
    ? estimate.currency
    : facts.salaryCurrency?.toUpperCase();
  const format = (amount: number) => {
    const number = formatter.format(amount);
    return currency === "ILS"
      ? `₪${number}`
      : `${number}${currency ? ` ${currency}` : ""}`;
  };
  const period = isEstimate ? estimate.period : facts.salaryPeriod;
  const scale = salaryRangeScale(min, max, currency, period);
  const periodLabel = t(
    `jobReview.salary.${period === "month" || period === "year" || period === "hour" || period === "day" ? period : "periodUnknown"}`,
  );
  const range = known
    ? min !== null && max !== null
      ? min === max
        ? format(min)
        : `${format(min)} – ${format(max)}`
      : t(min !== null ? "jobReview.salary.from" : "jobReview.salary.upTo", {
          amount: format((min ?? max)!),
        })
    : t("jobReview.salary.unknown");
  return (
    <section
      aria-label={t("jobReview.salary.heading")}
      className="bg-primary/5 rounded-xl p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold">
          <Wallet aria-hidden="true" className="text-primary size-4" />
          {t("jobReview.salary.heading")}
        </h4>
        {known ? (
          <span className="text-primary bg-primary/10 rounded-full px-2 py-1 text-[11px]">
            {t(
              isEstimate
                ? "jobReview.salary.estimated"
                : "jobReview.salary.listed",
            )}
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-xl font-semibold tabular-nums">
        <bdi>{range}</bdi>
      </p>
      {known ? (
        <>
          <p className="text-muted-foreground mt-1 text-xs">
            {isEstimate ? t("jobReview.salary.grossMonth") : periodLabel}
            {!currency ? ` · ${t("jobReview.salary.currencyUnknown")}` : ""}
          </p>
          {scale ? (
            <div aria-hidden="true" className="mt-3 px-1.5 py-2" dir="ltr">
              <div className="bg-primary/15 relative h-1.5 rounded-full">
                <span
                  className="bg-primary/65 absolute inset-y-0 rounded-full"
                  style={{
                    left: `${scale.start}%`,
                    width: `${scale.end - scale.start}%`,
                  }}
                />
                <span
                  className="bg-primary ring-background/80 absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2"
                  style={{ left: `${scale.start}%` }}
                />
                {scale.end !== scale.start ? (
                  <span
                    className="bg-primary ring-background/80 absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2"
                    style={{ left: `${scale.end}%` }}
                  />
                ) : null}
              </div>
            </div>
          ) : null}
          {isEstimate ? (
            <div className="text-muted-foreground mt-3 space-y-1 text-xs leading-relaxed">
              <p>{t("jobReview.salary.estimateDisclaimer")}</p>
              <p>{estimate.basis}</p>
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-muted-foreground mt-1 text-xs">
          {t("jobReview.salary.noEstimate")}
        </p>
      )}
    </section>
  );
}

function FitScore({
  score,
  verdict,
}: {
  score: number;
  verdict: DeepReview["verdict"];
}) {
  const { t } = useTranslation();
  const color =
    verdict === "low"
      ? "text-destructive"
      : verdict === "stretch"
        ? "text-warning"
        : "text-success";
  return (
    <div className="flex shrink-0 items-center gap-3 @lg:w-26 @lg:flex-col @lg:gap-2">
      <div
        className={cn("relative size-20 @lg:size-26", color)}
        role="img"
        aria-label={t("jobReview.fitScore", { score })}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 100 100"
          className="size-full -rotate-90"
        >
          <circle
            cx="50"
            cy="50"
            r="43"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            className="text-muted"
          />
          <circle
            cx="50"
            cy="50"
            r="43"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
            pathLength="100"
            strokeDasharray={`${score} 100`}
          />
        </svg>
        <span
          aria-hidden="true"
          className="absolute inset-0 grid place-items-center text-2xl font-semibold tabular-nums @lg:text-3xl"
          dir="ltr"
        >
          {score}
          <span className="absolute start-1/2 top-[63%] -translate-x-1/2 text-[10px] font-normal">
            %
          </span>
        </span>
      </div>
      {verdict ? (
        <span className={cn("text-center text-xs font-medium", color)}>
          {t(`jobReview.verdict.${verdict}`)}
        </span>
      ) : null}
    </div>
  );
}

function JobFactTags({
  facts,
  unavailable,
}: {
  facts: ReviewJobFacts;
  unavailable: boolean;
}) {
  const { t, i18n } = useTranslation();
  const location =
    facts.locationNames?.[
      i18n.resolvedLanguage?.startsWith("he") ? "he" : "en"
    ] ?? facts.locationText;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      <FactTag
        icon={
          unavailable
            ? X
            : facts.activityConfidence === "verified"
              ? ShieldCheck
              : CircleHelp
        }
        className={
          unavailable
            ? statusVisuals.gap.className
            : facts.activityConfidence === "verified"
              ? statusVisuals.met.className
              : statusVisuals.unknown.className
        }
      >
        {t(
          unavailable
            ? "jobReview.facts.closed"
            : facts.activityConfidence === "verified"
              ? "jobReview.facts.open"
              : "jobReview.facts.probable",
        )}
      </FactTag>
      {location ? (
        <FactTag icon={MapPin} className="border-info/20 bg-info/10 text-info">
          {location}
        </FactTag>
      ) : null}
      {facts.workArrangement !== "unknown" ? (
        <FactTag
          icon={facts.workArrangement === "remote" ? Globe : BriefcaseBusiness}
          className="border-primary/20 bg-primary/10 text-primary"
        >
          {t(`onboarding.options.workArrangement.${facts.workArrangement}`)}
        </FactTag>
      ) : null}
      {facts.employmentType && facts.employmentType !== "unknown" ? (
        <FactTag
          icon={BriefcaseBusiness}
          className="border-border bg-muted text-foreground"
        >
          {t(`jobReview.employmentTypes.${facts.employmentType}`)}
        </FactTag>
      ) : null}
    </div>
  );
}

function RequirementRow({
  item,
}: {
  item: NonNullable<DeepReview["requirements"]>[number];
}) {
  const { t } = useTranslation();
  const visual = statusVisuals[item.status];
  const Icon = visual.icon;
  return (
    <li>
      <details className="group border-border bg-card rounded-xl border">
        <summary className="focus-visible:ring-ring/40 flex min-h-13 cursor-pointer list-none items-center gap-2.5 rounded-xl px-3 py-2.5 outline-none focus-visible:ring-3 [&::-webkit-details-marker]:hidden">
          <span
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-full",
              visual.className,
            )}
          >
            <Icon aria-hidden="true" className="size-4" />
          </span>
          <span className="min-w-0 flex-1 text-sm font-medium">
            {requirementLabel(t, item.requirement)}
          </span>
          <span
            className={cn(
              "shrink-0 text-[11px] font-medium",
              visual.textClassName,
            )}
          >
            {t(`jobReview.requirementStatus.${item.status}`)}
          </span>
          <ChevronDown
            aria-hidden="true"
            className="text-muted-foreground size-3.5 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <div className="border-border border-t px-3 py-3 ps-12 text-xs leading-relaxed">
          <p className="text-muted-foreground">
            {item.evidence.startsWith("jobMatching.")
              ? t(item.evidence)
              : item.evidence}
          </p>
          {item.nextStep ? (
            <p className="mt-2 flex items-start gap-1.5">
              <ArrowUpRight
                aria-hidden="true"
                className="text-primary mt-0.5 size-3.5 shrink-0 rtl:-scale-x-100"
              />
              <span>
                {item.nextStep.startsWith("jobMatching.")
                  ? t(item.nextStep)
                  : item.nextStep}
              </span>
            </p>
          ) : null}
        </div>
      </details>
    </li>
  );
}

function FactTag({
  icon: Icon,
  children,
  className,
}: {
  icon: LucideIcon;
  children: ReactNode;
  className: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {children}
    </span>
  );
}

function ReviewSection({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-border border-t pt-5">
      <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Icon aria-hidden="true" className="text-primary size-4" />
        {title}
      </h4>
      {children}
    </section>
  );
}

function ApplicationRoute({
  href,
  icon: Icon,
  label,
  recommended = false,
  disabled = false,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  recommended?: boolean;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  let domain: string;
  try {
    domain = new URL(href).hostname.replace(/^www\./u, "");
  } catch {
    return null;
  }
  const content = (
    <>
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-xl",
          recommended
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground",
        )}
      >
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        <span
          dir="ltr"
          className="text-muted-foreground mt-0.5 block truncate text-start text-xs"
        >
          {domain}
        </span>
      </span>
      {recommended ? (
        <span className="bg-primary/10 text-primary rounded-full px-2 py-1 text-[10px] font-medium">
          {t("jobReview.apply.recommended")}
        </span>
      ) : null}
      <ArrowUpRight
        aria-hidden="true"
        className="text-muted-foreground size-4 shrink-0 rtl:-scale-x-100"
      />
    </>
  );
  const classes = cn(
    "flex min-h-19 items-center gap-2.5 rounded-xl border p-3",
    recommended
      ? "border-primary/30 bg-primary/5 hover:bg-primary/10"
      : "border-border bg-card hover:bg-muted/50",
  );
  if (disabled)
    return (
      <div aria-disabled="true" className={cn(classes, "opacity-50")}>
        {content}
      </div>
    );
  return (
    <a
      aria-label={label}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        classes,
        "focus-visible:ring-ring/40 transition-colors outline-none focus-visible:ring-3 motion-reduce:transition-none",
      )}
    >
      {content}
    </a>
  );
}
