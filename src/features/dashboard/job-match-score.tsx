import { Tooltip } from "@base-ui/react/tooltip";
import { Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type ScoreComponents = {
  role: number;
  requiredSkills: number;
  preferredSkills: number;
  experience: number;
  location: number;
  domain?: number;
  seniority?: number;
  preferences?: number;
};

type MatchHighlights = {
  targetRole?: string;
  pastRole?: string;
  skills: string[];
  domain?: string;
  location: boolean;
};

type JobMatchScoreProps = {
  score: number;
  quality?: "strong" | "partial" | "possible";
  components?: ScoreComponents;
  highlights?: MatchHighlights;
};

const SCORE_MAXIMUMS = {
  role: 35,
  skills: 25,
  domain: 15,
  experience: 10,
  seniority: 7,
  location: 5,
  preferences: 3,
} as const;

export function JobMatchScore({
  score,
  quality,
  components,
  highlights,
}: JobMatchScoreProps) {
  const { t } = useTranslation();
  const scoreValue = Math.max(0, Math.min(100, Math.round(score)));
  const matchQuality =
    quality ??
    (scoreValue >= 58 ? "strong" : scoreValue >= 45 ? "partial" : "possible");
  const qualityLabel = t(`jobDiscovery.matchQuality.${matchQuality}`);
  const rows = components
    ? [
        { key: "role", points: components.role },
        {
          key: "skills",
          points: components.requiredSkills + components.preferredSkills,
        },
        { key: "domain", points: components.domain ?? 0 },
        { key: "experience", points: components.experience },
        { key: "seniority", points: components.seniority ?? 0 },
        { key: "location", points: components.location },
        { key: "preferences", points: components.preferences ?? 0 },
      ]
    : [];

  const evidence = [
    highlights?.targetRole
      ? t("jobDiscovery.score.evidence.targetRole", {
          role: highlights.targetRole,
        })
      : highlights?.pastRole
        ? t("jobDiscovery.score.evidence.pastRole")
        : null,
    highlights?.skills.length
      ? t("jobDiscovery.score.evidence.skills", {
          skills: highlights.skills.join(" · "),
        })
      : null,
    highlights?.domain
      ? t("jobDiscovery.score.evidence.domain", {
          domain: highlights.domain,
        })
      : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        delay={180}
        aria-label={t("jobDiscovery.score.triggerLabel", {
          quality: qualityLabel,
          score: scoreValue,
        })}
        className={cn(
          "focus-visible:ring-ring/40 inline-flex min-h-9 shrink-0 cursor-help items-center gap-1.5 rounded-full border px-3 text-sm font-semibold tabular-nums transition-[background-color,border-color,box-shadow,transform] outline-none hover:-translate-y-px focus-visible:ring-3 motion-reduce:transition-none",
          matchQuality === "strong"
            ? "border-primary/20 bg-primary/10 text-primary"
            : matchQuality === "partial"
              ? "border-primary/15 bg-primary/5 text-foreground/85"
              : "border-border bg-muted/70 text-foreground/80",
        )}
      >
        <span>
          {t("jobDiscovery.score.badge", {
            quality: qualityLabel,
            score: scoreValue,
          })}
        </span>
        <Info aria-hidden="true" className="size-3.5" />
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner
          sideOffset={8}
          collisionPadding={12}
          className="z-50"
        >
          <Tooltip.Popup className="bg-popover text-popover-foreground border-border w-[min(22rem,calc(100vw-2rem))] origin-[var(--transform-origin)] rounded-xl border p-4 text-start shadow-xl transition-[transform,opacity] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none">
            <p className="font-semibold">
              {t("jobDiscovery.score.heading", { score: scoreValue })}
            </p>
            <p className="text-muted-foreground mt-1 text-xs leading-5">
              {t("jobDiscovery.score.description")}
            </p>
            {rows.length ? (
              <dl className="mt-3 space-y-2">
                {rows.map(({ key, points }) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-4 text-sm"
                  >
                    <dt>{t(`jobDiscovery.score.components.${key}`)}</dt>
                    <dd
                      className={cn(
                        "shrink-0 font-semibold tabular-nums",
                        points > 0 ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {points > 0 ? "+" : ""}
                      {points}/
                      {SCORE_MAXIMUMS[key as keyof typeof SCORE_MAXIMUMS]}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-muted-foreground mt-3 text-xs">
                {t("jobDiscovery.score.breakdownUnavailable")}
              </p>
            )}
            {evidence.length ? (
              <ul className="border-border text-muted-foreground mt-3 space-y-1 border-t pt-3 text-xs leading-5">
                {evidence.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            <p className="border-border text-muted-foreground mt-3 border-t pt-3 text-xs leading-5">
              {t("jobDiscovery.score.eligibilityNote")}
            </p>
            <Tooltip.Arrow className="bg-popover border-border size-2.5 rotate-45 border-s border-t" />
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
