import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useTranslation } from "react-i18next";
import { Check, X, LoaderCircle } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";

export function CatalogReview() {
  const { t, i18n } = useTranslation();
  const reviews = useQuery(api.referenceIdentity.listReview);
  const status = useQuery(api.referenceIdentity.curationStatus);
  const decide = useMutation(api.referenceIdentity.decideCandidate);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function review(id: Id<"catalogTermCandidates">, approve: boolean) {
    setBusy(id);
    setError(null);
    try {
      if (!(await decide({ id, approve })))
        setError(t("admin.catalog.conflict"));
    } catch {
      setError(t("common.error"));
    } finally {
      setBusy(null);
    }
  }
  if (!reviews || !status)
    return (
      <LoaderCircle
        aria-label={t("common.loading")}
        className="size-5 animate-spin"
      />
    );
  return (
    <div className="space-y-6">
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <section className="bg-card border-border rounded-2xl border p-5">
        <h2 className="font-semibold">{t("admin.catalog.review")}</h2>
        {!reviews.length ? (
          <p className="text-muted-foreground mt-3 text-sm">
            {t("admin.catalog.empty")}
          </p>
        ) : (
          <ul className="mt-3 divide-y">
            {reviews.map((item) => (
              <li
                key={item._id}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {item.term}
                    <span className="text-muted-foreground mx-2">→</span>
                    {i18n.language.startsWith("he")
                      ? item.proposal?.canonicalHe
                      : item.proposal?.canonicalEn}
                  </p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {item.proposal?.reason}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {t("admin.catalog.occurrences", {
                      count: item.occurrenceCount,
                    })}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => void review(item._id, true)}
                  >
                    <Check aria-hidden="true" />
                    {t("admin.catalog.approve")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => void review(item._id, false)}
                  >
                    <X aria-hidden="true" />
                    {t("admin.catalog.reject")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="bg-card border-border rounded-2xl border p-5">
        <h2 className="font-semibold">{t("admin.catalog.pending")}</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {t("admin.catalog.schedule")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {status.pending.map((item) => (
            <span
              key={item._id}
              className="bg-muted rounded-lg px-2.5 py-1.5 text-sm"
            >
              {item.term}
              <span className="text-muted-foreground ms-2 text-xs">
                {item.occurrenceCount}
              </span>
            </span>
          ))}
        </div>
      </section>
      <section className="bg-card border-border rounded-2xl border p-5">
        <h2 className="font-semibold">{t("admin.catalog.runs")}</h2>
        <ul className="mt-3 divide-y">
          {status.runs.map((run) => (
            <li
              key={run._id}
              className="flex flex-wrap justify-between gap-2 py-3 text-sm"
            >
              <span>
                {run.period} · {t("admin.catalog.status." + run.status)}
              </span>
              <span className="text-muted-foreground">
                {t("admin.catalog.runSummary", {
                  approved: run.approved ?? 0,
                  review: run.review ?? 0,
                  tokens: (run.inputTokens ?? 0) + (run.outputTokens ?? 0),
                })}
              </span>
              {run.error ? (
                <p className="text-destructive w-full">{run.error}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
