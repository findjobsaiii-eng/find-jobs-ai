import { v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const DECISION_COHORT_COUNT = 8;
const CORE_PRODUCT_EVENTS = new Set([
  "job_source_clicked",
  "job_saved",
  "application_status_changed",
  "deep_review_requested",
]);
function isCoreProductEvent(event: string) {
  return CORE_PRODUCT_EVENTS.has(event);
}
function percentage(numerator: number, denominator: number) {
  return denominator ? Math.round((numerator / denominator) * 100) : null;
}
export type MetricsRows = {
  trackingStartedAt?: number | null;
  users: Array<Pick<Doc<"users">, "_id" | "_creationTime">>;
  runs: Array<Pick<Doc<"jobSearchRuns">, "startedAt" | "status">>;
  audits: Array<Pick<Doc<"dailyDiscoveryAudits">, "dayKey" | "status">>;
  discoveries: Array<Pick<Doc<"jobDiscoveries">, "discoveredAt" | "jobId">>;
  jobs: Array<Pick<Doc<"jobs">, "firstDiscoveredAt">>;
  matches: Array<Pick<Doc<"jobMatches">, "_creationTime">>;
  activity: Array<
    Pick<
      Doc<"userActivity">,
      "userId" | "lastSeenAt" | "lastMeaningfulActionAt"
    >
  >;
  events: Array<Pick<Doc<"productEvents">, "userId" | "event" | "occurredAt">>;
  emailEvents: Array<
    Pick<Doc<"emailDeliveryEvents">, "userId" | "type" | "occurredAt">
  >;
  adminMemberships: Array<Pick<Doc<"adminMemberships">, "userId" | "active">>;
};

export const overviewValidator = v.object({
  totalUsers: v.number(),
  newUsers: v.number(),
  scheduledUsers: v.number(),
  searchesAttempted: v.number(),
  searchesSkipped: v.number(),
  jobsFound: v.number(),
  jobsInserted: v.number(),
  matchesCreated: v.number(),
  failures: v.number(),
  weeklyActiveUsers: v.number(),
  weeklyEngagedUsers: v.number(),
  jobsSaved: v.number(),
  applicationUpdates: v.number(),
  jobSourceClicks: v.number(),
  emailsDelivered: v.number(),
  emailsOpened: v.number(),
  emailsClicked: v.number(),
  truncated: v.boolean(),
});
const decisionCohort = v.object({
  start: v.number(),
  end: v.number(),
  signups: v.number(),
  activated: v.number(),
  retained: v.number(),
  activationRate: v.union(v.number(), v.null()),
  retentionRate: v.union(v.number(), v.null()),
  activationMatured: v.boolean(),
  retentionMatured: v.boolean(),
});

export const decisionMetricsValidator = v.object({
  trackingStartedAt: v.union(v.number(), v.null()),
  decision: v.union(
    v.literal("collecting"),
    v.literal("promising"),
    v.literal("mixed"),
    v.literal("weak"),
  ),
  weeklyActiveUsers: v.number(),
  weeklyCoreUsers: v.number(),
  priorWeekCoreUsers: v.number(),
  retainedCoreUsers: v.number(),
  rollingRetentionRate: v.union(v.number(), v.null()),
  coreActions: v.number(),
  averageActiveDays: v.union(v.number(), v.null()),
  maturedSignups: v.number(),
  activatedSignups: v.number(),
  activationRate: v.union(v.number(), v.null()),
  retentionEligibleActivated: v.number(),
  retainedUsers: v.number(),
  cohortRetentionRate: v.union(v.number(), v.null()),
  cohorts: v.array(decisionCohort),
  truncated: v.boolean(),
});
export function computeOverview(
  rows: MetricsRows,
  args: { start: number; end: number; dayKey: string },
): Infer<typeof overviewValidator> {
  const { users, adminMemberships } = rows;
  const within = (time: number) => time >= args.start && time < args.end;
  const weekStart = args.end - WEEK_MS;
  const newUsers = users.filter((user) => within(user._creationTime));
  const runs = rows.runs.filter((run) => within(run.startedAt));
  const audits = rows.audits.filter((audit) => audit.dayKey === args.dayKey);
  const discoveries = rows.discoveries.filter((item) =>
    within(item.discoveredAt),
  );
  const jobs = rows.jobs.filter((item) => within(item.firstDiscoveredAt));
  const matches = rows.matches.filter((item) => within(item._creationTime));
  const activeUsers = rows.activity.filter(
    (item) => item.lastSeenAt >= weekStart && item.lastSeenAt < args.end,
  );
  const engagedUsers = rows.activity.filter(
    (item) =>
      (item.lastMeaningfulActionAt ?? 0) >= weekStart &&
      (item.lastMeaningfulActionAt ?? 0) < args.end,
  );
  const events = rows.events.filter((item) => within(item.occurredAt));
  const jobsSaved = events.filter((item) => item.event === "job_saved");
  const applicationUpdates = events.filter(
    (item) => item.event === "application_status_changed",
  );
  const jobSourceClicks = events.filter(
    (item) => item.event === "job_source_clicked",
  );
  const emailEvents = rows.emailEvents.filter((item) =>
    within(item.occurredAt),
  );
  const emailsDelivered = emailEvents.filter(
    (item) => item.type === "delivered",
  );
  const emailsOpened = emailEvents.filter((item) => item.type === "opened");
  const emailsClicked = emailEvents.filter((item) => item.type === "clicked");
  const adminIds = new Set(
    adminMemberships
      .filter((membership) => membership.active)
      .map((membership) => membership.userId),
  );
  return {
    totalUsers: users.length,
    newUsers: newUsers.length,
    scheduledUsers: audits.length,
    searchesAttempted: runs.length,
    searchesSkipped: audits.filter((item) => item.status === "skipped").length,
    jobsFound: new Set(discoveries.map((item) => item.jobId)).size,
    jobsInserted: jobs.length,
    matchesCreated: matches.length,
    failures:
      runs.filter((item) => item.status === "failed").length +
      audits.filter((item) => item.status === "failed").length,
    weeklyActiveUsers: activeUsers.filter(
      (activity) => !adminIds.has(activity.userId),
    ).length,
    weeklyEngagedUsers: engagedUsers.filter(
      (activity) => !adminIds.has(activity.userId),
    ).length,
    jobsSaved: jobsSaved.filter((event) => !adminIds.has(event.userId)).length,
    applicationUpdates: applicationUpdates.filter(
      (event) => !adminIds.has(event.userId),
    ).length,
    jobSourceClicks: jobSourceClicks.filter(
      (event) => !adminIds.has(event.userId),
    ).length,
    emailsDelivered: emailsDelivered.filter(
      (event) => !adminIds.has(event.userId),
    ).length,
    emailsOpened: emailsOpened.filter((event) => !adminIds.has(event.userId))
      .length,
    emailsClicked: emailsClicked.filter((event) => !adminIds.has(event.userId))
      .length,
    truncated: false,
  };
}
export function computeDecisionMetrics(
  rows: MetricsRows,
  args: { now: number },
): Infer<typeof decisionMetricsValidator> {
  const { adminMemberships } = rows;
  const trackingStartedAt =
    rows.trackingStartedAt !== undefined
      ? rows.trackingStartedAt
      : rows.events.reduce<number | null>(
          (min, event) =>
            min === null ? event.occurredAt : Math.min(min, event.occurredAt),
          null,
        );
  const historyStart = args.now - (DECISION_COHORT_COUNT + 1) * WEEK_MS;
  const currentWeekStart = args.now - WEEK_MS;
  const priorWeekStart = args.now - 2 * WEEK_MS;
  const events = rows.events.filter(
    (event) => event.occurredAt >= historyStart && event.occurredAt < args.now,
  );
  const users = rows.users.filter(
    (user) =>
      trackingStartedAt !== null &&
      user._creationTime >= trackingStartedAt &&
      user._creationTime < args.now,
  );
  const activeUsers = rows.activity.filter(
    (item) => item.lastSeenAt >= currentWeekStart && item.lastSeenAt < args.now,
  );
  const adminIds = new Set(
    adminMemberships
      .filter((membership) => membership.active)
      .map((membership) => membership.userId),
  );
  const betaUsers = users.filter((user) => !adminIds.has(user._id));
  const coreEvents = events.filter(
    (event) => !adminIds.has(event.userId) && isCoreProductEvent(event.event),
  );
  const currentCoreEvents = coreEvents.filter(
    (event) => event.occurredAt >= currentWeekStart,
  );
  const priorCoreEvents = coreEvents.filter(
    (event) =>
      event.occurredAt >= priorWeekStart && event.occurredAt < currentWeekStart,
  );
  const currentCoreUsers = new Set(
    currentCoreEvents.map((event) => event.userId),
  );
  const priorCoreUsers = new Set(priorCoreEvents.map((event) => event.userId));
  const retainedCoreUsers = [...currentCoreUsers].filter((userId) =>
    priorCoreUsers.has(userId),
  ).length;
  const activeDays = new Map<string, Set<number>>();
  for (const event of currentCoreEvents) {
    const days = activeDays.get(event.userId) ?? new Set<number>();
    days.add(Math.floor((event.occurredAt - currentWeekStart) / DAY_MS));
    activeDays.set(event.userId, days);
  }
  const coreEventsByUser = new Map<Id<"users">, typeof coreEvents>();
  for (const event of coreEvents) {
    const userEvents = coreEventsByUser.get(event.userId) ?? [];
    userEvents.push(event);
    coreEventsByUser.set(event.userId, userEvents);
  }
  const cohorts = Array.from({ length: DECISION_COHORT_COUNT }, (_, index) => {
    const start = args.now - (index + 1) * WEEK_MS;
    const end = args.now - index * WEEK_MS;
    const cohortUsers = betaUsers.filter(
      (user) => user._creationTime >= start && user._creationTime < end,
    );
    let activated = 0;
    let retained = 0;
    for (const user of cohortUsers) {
      const activationEnd = user._creationTime + WEEK_MS;
      const retentionEnd = activationEnd + WEEK_MS;
      const userEvents = coreEventsByUser.get(user._id) ?? [];
      const userActivated = userEvents.some(
        (event) =>
          event.occurredAt >= user._creationTime &&
          event.occurredAt < activationEnd,
      );
      if (userActivated) activated += 1;
      if (
        userActivated &&
        userEvents.some(
          (event) =>
            event.occurredAt >= activationEnd &&
            event.occurredAt < retentionEnd,
        )
      ) {
        retained += 1;
      }
    }
    return {
      start,
      end,
      signups: cohortUsers.length,
      activated,
      retained,
      activationRate: percentage(activated, cohortUsers.length),
      retentionRate: percentage(retained, activated),
      activationMatured: end + WEEK_MS <= args.now,
      retentionMatured: end + 2 * WEEK_MS <= args.now,
    };
  });
  const activationCohorts = cohorts.filter(
    (cohort) => cohort.activationMatured,
  );
  const retentionCohorts = cohorts.filter((cohort) => cohort.retentionMatured);
  const maturedSignups = activationCohorts.reduce(
    (sum, cohort) => sum + cohort.signups,
    0,
  );
  const activatedSignups = activationCohorts.reduce(
    (sum, cohort) => sum + cohort.activated,
    0,
  );
  const retentionEligibleActivated = retentionCohorts.reduce(
    (sum, cohort) => sum + cohort.activated,
    0,
  );
  const retainedUsers = retentionCohorts.reduce(
    (sum, cohort) => sum + cohort.retained,
    0,
  );
  const activationRate = percentage(activatedSignups, maturedSignups);
  const cohortRetentionRate = percentage(
    retainedUsers,
    retentionEligibleActivated,
  );
  const decision: "collecting" | "promising" | "mixed" | "weak" =
    maturedSignups < 10 || retentionEligibleActivated < 5
      ? "collecting"
      : (activationRate ?? 0) >= 40 && (cohortRetentionRate ?? 0) >= 25
        ? "promising"
        : (activationRate ?? 0) < 20 || (cohortRetentionRate ?? 0) < 10
          ? "weak"
          : "mixed";
  const totalActiveDays = [...activeDays.values()].reduce(
    (sum, days) => sum + days.size,
    0,
  );
  return {
    trackingStartedAt,
    decision,
    weeklyActiveUsers: activeUsers.filter(
      (activity) => !adminIds.has(activity.userId),
    ).length,
    weeklyCoreUsers: currentCoreUsers.size,
    priorWeekCoreUsers: priorCoreUsers.size,
    retainedCoreUsers,
    rollingRetentionRate: percentage(retainedCoreUsers, priorCoreUsers.size),
    coreActions: currentCoreEvents.length,
    averageActiveDays: currentCoreUsers.size
      ? Math.round((totalActiveDays / currentCoreUsers.size) * 10) / 10
      : null,
    maturedSignups,
    activatedSignups,
    activationRate,
    retentionEligibleActivated,
    retainedUsers,
    cohortRetentionRate,
    cohorts,
    truncated: false,
  };
}
