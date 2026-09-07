import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
// The hourly sweep only claims profiles whose daily attempt is due.
crons.interval(
  "daily profile job discovery",
  { hours: 1 },
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
