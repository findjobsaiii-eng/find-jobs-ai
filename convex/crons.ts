import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval(
  "recover stalled job searches",
  { minutes: 5 },
  internal.jobDiscovery.recoverStalledSearches,
  {},
);
// Run hourly; dispatch maps the current Israel hour to one of ten user cohorts.
crons.cron(
  "daily profile job discovery",
  "7 * * * *",
  internal.dailyDiscovery.dispatch,
  {},
);
crons.interval(
  "verify stale job sources",
  { hours: 1 },
  internal.jobActivityActions.verifyDueSources,
  {},
);
// One bounded vocabulary cleanup on the first of each month (UTC).
crons.cron(
  "monthly career vocabulary cleanup",
  "20 2 1 * *",
  internal.referenceIdentityActions.curateMonthly,
  {},
);
crons.interval(
  "recover stalled resume processing",
  { minutes: 5 },
  internal.resumes.recoverStalledProcessing,
  {},
);
crons.interval(
  "refresh admin metric snapshots",
  { minutes: 5 },
  internal.adminMetrics.refreshRecent,
  {},
);
export default crons;
