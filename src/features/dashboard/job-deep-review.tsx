import { useState, type ReactNode } from "react";
import { useAction } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  ChevronDown,
  ExternalLink,
  FileText,
  LockKeyhole,
  RefreshCw,
  Sparkles,
  Target,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";

type Review = {
  status: "pending" | "completed" | "failed";
  language: "en" | "he";
  stale: boolean;
  matchPercentage?: number;
  verdict?: "strong" | "good" | "stretch" | "low";
  summary?: string;
  strengths?: Array<{ title: string; detail: string }>;
  gaps?: Array<{
    requirement: string;
    currentEvidence: string;
    howToClose: string;
    importance: "must_have" | "important" | "minor";
  }>;
  resumeName?: string;
  resumeRationale?: string;
  resumeChanges?: Array<{ section: string; change: string; reason: string }>;
  companyWebsiteUrl?: string | null;
  directApplicationUrl?: string | null;
  applicationNote?: string;
  interviewFocus?: string[];
  errorCode?: string;
};

export function JobDeepReview({
  jobId,
  unavailable,
  plan,
  review,
}: {
  jobId: Id<"jobs">;
  unavailable: boolean;
  plan: "free" | "pro" | "admin";
  review?: Review;
}) {
  const { i18n, t } = useTranslation();
  const runReview = useAction(api.jobReviewActions.reviewJob);
  const [requesting, setRequesting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [failed, setFailed] = useState(false);
  const isPaid = plan === "pro" || plan === "admin";
  const isLoading = requesting || review?.status === "pending";

  const requestReview = async () => {
    if (!isPaid || unavailable || isLoading) return;
    setRequesting(true);
    setFailed(false);
    setExpanded(true);
    try {
      await runReview({
        jobId,
        language: i18n.resolvedLanguage?.startsWith("he") ? "he" : "en",
      });
    } catch {
      setFailed(true);
    } finally {
      setRequesting(false);
    }
  };

  const hasReview = review?.status === "completed" && review.summary;
  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="relative min-h-11 overflow-hidden"
          disabled={isLoading || (!hasReview && (!isPaid || unavailable))}
          aria-expanded={hasReview ? expanded : undefined}
          onClick={() => {
            if (hasReview) setExpanded((value) => !value);
            else void requestReview();
          }}
          title={!isPaid && !hasReview ? t("jobReview.proOnly") : undefined}
        >
          {isLoading ? (
            <ReviewPulse />
          ) : isPaid || hasReview ? (
            <Sparkles aria-hidden="true" className="text-primary" />
          ) : (
            <LockKeyhole aria-hidden="true" />
          )}
          {isLoading
            ? t("jobReview.loading")
            : hasReview
              ? t("jobReview.open", { score: review.matchPercentage })
              : t("jobReview.action")}
          {hasReview ? (
            <ChevronDown
              aria-hidden="true"
              className={`transition-transform motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
            />
          ) : null}
        </Button>
        {!isPaid && !hasReview ? (
          <span className="text-muted-foreground text-xs">
            {t("jobReview.proOnly")}
          </span>
        ) : null}
      </div>

      <AnimatePresence initial={false}>
        {isLoading && expanded ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="border-primary/15 bg-primary/5 mt-3 overflow-hidden rounded-xl border"
          >
            <div className="flex items-center gap-3 px-4 py-4">
              <span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-xl">
                <Sparkles aria-hidden="true" className="size-5 animate-pulse" />
              </span>
              <div>
                <p className="text-sm font-medium">
                  {t("jobReview.loadingTitle")}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {t("jobReview.loadingDescription")}
                </p>
              </div>
            </div>
          </motion.div>
        ) : null}

        {hasReview && expanded && !isLoading ? (
          <motion.section
            key="review"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            aria-label={t("jobReview.heading")}
            className="border-border bg-muted/35 mt-3 rounded-xl border p-4 sm:p-5"
          >
            <div className="flex items-start gap-4">
              <div className="border-primary/20 bg-card grid size-16 shrink-0 place-items-center rounded-2xl border shadow-sm">
                <span className="text-primary text-xl font-semibold">
                  {review.matchPercentage}%
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{t("jobReview.heading")}</h3>
                  {review.verdict ? (
                    <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium">
                      {t(`jobReview.verdict.${review.verdict}`)}
                    </span>
                  ) : null}
                  {review.stale ? (
                    <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">
                      {t("jobReview.stale")}
                    </span>
                  ) : null}
                </div>
                <p className="text-foreground/80 mt-2 text-sm leading-6">
                  {review.summary}
                </p>
              </div>
            </div>

            {review.strengths?.length ? (
              <ReviewSection icon={Sparkles} title={t("jobReview.strengths")}>
                <ul className="space-y-2">
                  {review.strengths.map((strength) => (
                    <li key={`${strength.title}-${strength.detail}`}>
                      <span className="text-sm font-medium">
                        {strength.title}
                      </span>
                      <p className="text-muted-foreground mt-0.5 text-sm leading-6">
                        {strength.detail}
                      </p>
                    </li>
                  ))}
                </ul>
              </ReviewSection>
            ) : null}

            {review.gaps?.length ? (
              <ReviewSection icon={AlertTriangle} title={t("jobReview.gaps")}>
                <ul className="space-y-3">
                  {review.gaps.map((gap) => (
                    <li
                      key={`${gap.requirement}-${gap.currentEvidence}`}
                      className="border-border bg-card rounded-lg border p-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">
                          {gap.requirement}
                        </span>
                        <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px]">
                          {t(`jobReview.importance.${gap.importance}`)}
                        </span>
                      </div>
                      <p className="text-muted-foreground mt-1.5 text-sm leading-6">
                        {gap.currentEvidence}
                      </p>
                      <p className="text-foreground/80 mt-1 text-sm leading-6">
                        {gap.howToClose}
                      </p>
                    </li>
                  ))}
                </ul>
              </ReviewSection>
            ) : null}

            <ReviewSection
              icon={FileText}
              title={t("jobReview.resume.heading")}
            >
              {review.resumeName ? (
                <p className="text-sm font-medium">
                  {t("jobReview.resume.use", { name: review.resumeName })}
                </p>
              ) : null}
              {review.resumeRationale ? (
                <p className="text-muted-foreground mt-1 text-sm leading-6">
                  {review.resumeRationale}
                </p>
              ) : null}
              {review.resumeChanges?.length ? (
                <ul className="mt-3 space-y-2">
                  {review.resumeChanges.map((change) => (
                    <li key={`${change.section}-${change.change}`}>
                      <span className="text-sm font-medium">
                        {change.section}
                      </span>
                      <p className="text-foreground/80 mt-0.5 text-sm leading-6">
                        {change.change}
                      </p>
                      <p className="text-muted-foreground text-xs leading-5">
                        {change.reason}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : null}
            </ReviewSection>

            <ReviewSection icon={Target} title={t("jobReview.apply.heading")}>
              <p className="text-muted-foreground text-sm leading-6">
                {review.applicationNote}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {review.directApplicationUrl ? (
                  <ReviewLink href={review.directApplicationUrl}>
                    {t("jobReview.apply.direct")}
                  </ReviewLink>
                ) : null}
                {review.companyWebsiteUrl ? (
                  <ReviewLink href={review.companyWebsiteUrl}>
                    {t("jobReview.apply.company")}
                  </ReviewLink>
                ) : null}
              </div>
            </ReviewSection>

            {review.interviewFocus?.length ? (
              <ReviewSection
                icon={Target}
                title={t("jobReview.interviewFocus")}
              >
                <ul className="list-disc space-y-1 ps-5 text-sm leading-6">
                  {review.interviewFocus.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </ReviewSection>
            ) : null}

            {isPaid && !unavailable ? (
              <Button
                type="button"
                variant="ghost"
                className="mt-4 min-h-10"
                onClick={() => void requestReview()}
              >
                <RefreshCw aria-hidden="true" />
                {t("jobReview.refresh")}
              </Button>
            ) : null}
          </motion.section>
        ) : null}
      </AnimatePresence>

      {(failed || review?.status === "failed") && !isLoading ? (
        <p role="alert" className="text-destructive mt-2 text-sm">
          {t(
            review?.errorCode === "job_inactive"
              ? "jobReview.inactive"
              : "jobReview.error",
          )}
        </p>
      ) : null}
    </div>
  );
}

function ReviewPulse() {
  return (
    <span
      aria-hidden="true"
      className="flex w-4 items-center justify-center gap-0.5"
    >
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="bg-primary size-1 animate-pulse rounded-full motion-reduce:animate-none"
          style={{ animationDelay: `${index * 160}ms` }}
        />
      ))}
    </span>
  );
}

function ReviewSection({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Sparkles;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-border mt-5 border-t pt-4">
      <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Icon aria-hidden="true" className="text-primary size-4" />
        {title}
      </h4>
      {children}
    </section>
  );
}

function ReviewLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="border-border bg-card hover:border-primary/30 focus-visible:ring-ring/40 inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-3 motion-reduce:transition-none"
    >
      {children}
      <ExternalLink aria-hidden="true" className="size-3.5" />
    </a>
  );
}
