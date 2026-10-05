import { useId, useRef, useState, type ReactNode } from "react";
import { useAction } from "convex/react";
import {
  AnimatePresence,
  domAnimation,
  LazyMotion,
  useReducedMotion,
} from "motion/react";
import * as m from "motion/react-m";
import {
  ChevronDown,
  ChevronUp,
  LockKeyhole,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { ConvexError } from "convex/values";
import { Button } from "@/components/ui/button";
import { captureProductEvent } from "@/features/privacy/analytics";
import {
  DeepReviewContent,
  type DeepReview,
  type ReviewJobFacts,
} from "./job-deep-review-content";

export function JobDeepReview({
  jobId,
  unavailable,
  plan,
  review,
  facts,
  actions,
  readOnly = false,
}: {
  jobId: Id<"jobs">;
  unavailable: boolean;
  plan: "free" | "pro" | "admin";
  review?: DeepReview;
  facts: ReviewJobFacts;
  actions: ReactNode;
  readOnly?: boolean;
}) {
  const { i18n, t } = useTranslation();
  const runReview = useAction(api.jobReviewActions.reviewJob);
  const [requesting, setRequesting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [failureKey, setFailureKey] = useState("jobReview.error");
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const reduceMotion = useReducedMotion();
  const isPaid = plan === "pro" || plan === "admin";
  const isLoading = requesting || review?.status === "pending";
  const hasReview = review?.status === "completed" && Boolean(review.summary);

  const collapse = () => {
    setExpanded(false);
    requestAnimationFrame(() => {
      toggleRef.current?.focus({ preventScroll: true });
      toggleRef.current?.scrollIntoView?.({
        block: "nearest",
        behavior: reduceMotion ? "instant" : "smooth",
      });
    });
  };
  const requestReview = async () => {
    if (readOnly || !isPaid || unavailable || isLoading) return;
    setRequesting(true);
    setFailed(false);
    setExpanded(true);
    try {
      await runReview({
        jobId,
        language: i18n.resolvedLanguage?.startsWith("he") ? "he" : "en",
      });
      void captureProductEvent("deep_review_requested", {
        language: i18n.resolvedLanguage?.startsWith("he") ? "he" : "en",
        plan,
      });
    } catch (cause) {
      setFailureKey(
        cause instanceof ConvexError &&
          typeof cause.data === "object" &&
          cause.data?.code === "REVIEW_RESUMES_TOO_LARGE"
          ? "jobReview.resumeContentTooLarge"
          : "jobReview.error",
      );
      setFailed(true);
    } finally {
      setRequesting(false);
    }
  };
  const label = isLoading
    ? t("jobReview.loading")
    : hasReview
      ? t("jobReview.open", { score: review?.matchPercentage })
      : t("jobReview.action");

  return (
    <LazyMotion features={domAnimation}>
      <div className="border-border mt-5 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 border-t pt-4 @2xl:gap-3">
        <div className="flex items-center gap-2">
          <Button
            ref={toggleRef}
            type="button"
            variant="outline"
            className="relative min-h-11 min-w-11 overflow-hidden @2xl:min-w-0"
            disabled={
              isLoading || (!hasReview && (readOnly || !isPaid || unavailable))
            }
            aria-label={label}
            aria-expanded={expanded}
            aria-controls={expanded ? panelId : undefined}
            onClick={() => {
              if (hasReview) {
                if (expanded) collapse();
                else setExpanded(true);
              } else if (!readOnly) void requestReview();
            }}
            title={
              readOnly && !hasReview
                ? t("admin.preview.readOnly")
                : !isPaid && !hasReview
                  ? t("jobReview.proOnly")
                  : undefined
            }
          >
            {isLoading ? (
              <ReviewPulse />
            ) : isPaid || hasReview ? (
              <Sparkles aria-hidden="true" className="text-primary" />
            ) : (
              <LockKeyhole aria-hidden="true" />
            )}
            <span className="hidden @2xl:inline">{label}</span>
            {hasReview ? (
              <ChevronDown
                aria-hidden="true"
                className={`hidden transition-transform motion-reduce:transition-none @2xl:block ${expanded ? "rotate-180" : ""}`}
              />
            ) : null}
          </Button>
          {!isPaid && !hasReview ? (
            <span className="text-muted-foreground hidden text-xs @2xl:inline">
              {t("jobReview.proOnly")}
            </span>
          ) : null}
        </div>
        {actions}
        <AnimatePresence initial={false}>
          {isLoading && expanded ? (
            <m.div
              id={panelId}
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.18 }}
              className="border-primary/15 bg-primary/5 col-span-full rounded-2xl border"
              role="status"
            >
              <div className="flex items-center gap-3 p-4">
                <span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-xl">
                  <Sparkles
                    aria-hidden="true"
                    className="size-5 animate-pulse motion-reduce:animate-none"
                  />
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
            </m.div>
          ) : null}
          {hasReview && review && expanded && !isLoading ? (
            <m.section
              id={panelId}
              key="review"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.18 }}
              aria-label={t("jobReview.heading")}
              className="border-border bg-muted/25 @container col-span-full rounded-2xl border"
            >
              <div className="border-border bg-card/95 sticky top-16 z-20 flex min-h-13 items-center justify-between gap-2 rounded-t-2xl border-b px-4 py-2 backdrop-blur-md sm:top-17 sm:px-5">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Sparkles
                    aria-hidden="true"
                    className="text-primary size-4 shrink-0"
                  />
                  <h3 className="text-sm font-semibold">
                    {t("jobReview.heading")}
                  </h3>
                  {review.stale ? (
                    <span className="bg-warning/10 text-warning rounded-full px-2 py-0.5 text-[10px] font-medium">
                      {t("jobReview.stale")}
                    </span>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-10 shrink-0 gap-1.5"
                  onClick={collapse}
                  aria-controls={panelId}
                  aria-expanded={true}
                >
                  <ChevronUp aria-hidden="true" className="size-4" />
                  {t("jobReview.collapse")}
                </Button>
              </div>
              <DeepReviewContent
                review={review}
                facts={facts}
                unavailable={unavailable}
              />
              <div className="border-border flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 sm:px-5">
                {isPaid && !unavailable && !readOnly ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground min-h-10"
                    onClick={() => void requestReview()}
                  >
                    <RefreshCw aria-hidden="true" className="size-3.5" />
                    {t("jobReview.refresh")}
                  </Button>
                ) : (
                  <span />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-10"
                  onClick={collapse}
                  aria-controls={panelId}
                  aria-expanded={true}
                >
                  <ChevronUp aria-hidden="true" className="size-4" />
                  {t("jobReview.collapse")}
                </Button>
              </div>
            </m.section>
          ) : null}
        </AnimatePresence>
        {(failed || review?.status === "failed") && !isLoading ? (
          <p role="alert" className="text-destructive col-span-full text-sm">
            {t(
              review?.errorCode === "job_inactive"
                ? "jobReview.inactive"
                : failureKey,
            )}
          </p>
        ) : null}
      </div>
    </LazyMotion>
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
