import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
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
export default crons;
