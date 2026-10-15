import { ConvexError } from "convex/values";
import { globalDayKey } from "./jobSearchPolicy";

export type AutomaticDiscoveryCadence = "daily" | "weekly";
export type DiscoveryBucket = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export function automaticDiscoveryCadence(
  value: string | undefined,
): AutomaticDiscoveryCadence {
  if (value === undefined || value === "weekly") return "weekly";
  if (value === "daily") return "daily";
  throw new ConvexError({ code: "INVALID_AUTOMATIC_DISCOVERY_CADENCE" });
}

function hash(value: string) {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.codePointAt(0) ?? 0;
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function israelCalendar(now: number) {
  // Convert the Israel calendar date, not the host date, to an integer day.
  const day = Date.parse(`${globalDayKey(now)}T00:00:00Z`) / 86_400_000;
  const weekday = (day + 4) % 7; // Sunday = 0.
  return { weekday, week: Math.floor((day + 4) / 7) };
}

export function discoveryBucket(userId: string): DiscoveryBucket {
  return (hash(userId) % 10) as DiscoveryBucket;
}

export function israelDiscoveryBucket(now: number): DiscoveryBucket | null {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jerusalem",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
  return hour >= 8 && hour <= 17 ? ((hour - 8) as DiscoveryBucket) : null;
}

export function discoverySchedule(
  userId: string,
  now: number,
  cadence: AutomaticDiscoveryCadence,
) {
  const calendar = israelCalendar(now);
  return {
    weekday: cadence === "weekly" ? hash(`weekday:${userId}`) % 7 : null,
    bucket: (cadence === "weekly"
      ? (discoveryBucket(userId) + calendar.week) % 10
      : discoveryBucket(userId)) as DiscoveryBucket,
    isScheduledDay:
      cadence === "daily" || calendar.weekday === hash(`weekday:${userId}`) % 7,
  };
}

export function alreadyAttemptedInPeriod(
  lastAttemptAt: number | undefined,
  now: number,
  cadence: AutomaticDiscoveryCadence,
) {
  if (lastAttemptAt === undefined) return false;
  return cadence === "weekly"
    ? israelCalendar(lastAttemptAt).week === israelCalendar(now).week
    : globalDayKey(lastAttemptAt) === globalDayKey(now);
}
