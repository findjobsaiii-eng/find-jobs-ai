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
export default crons;
