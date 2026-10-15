import { describe, expect, it } from "vitest";
import {
  alreadyAttemptedInPeriod,
  automaticDiscoveryCadence,
  discoverySchedule,
  israelDiscoveryBucket,
} from "./jobDiscoverySchedule";

describe("automatic discovery schedule", () => {
  it("defaults to weekly and rejects invalid settings", () => {
    expect(automaticDiscoveryCadence(undefined)).toBe("weekly");
    expect(automaticDiscoveryCadence("weekly")).toBe("weekly");
    expect(automaticDiscoveryCadence("daily")).toBe("daily");
    expect(() => automaticDiscoveryCadence("wekly")).toThrow();
  });

  it("spreads users across all seven weekdays and ten hours", () => {
    const now = Date.parse("2026-10-14T09:00:00Z");
    const slots = Array.from({ length: 1000 }, (_, i) =>
      discoverySchedule(`users:${i}`, now, "weekly"),
    );
    expect(new Set(slots.map((s) => s.weekday)).size).toBe(7);
    expect(new Set(slots.map((s) => `${s.weekday}:${s.bucket}`)).size).toBe(70);
    expect(
      new Set(slots.filter((s) => s.isScheduledDay).map((s) => s.weekday)),
    ).toEqual(new Set([3]));
  });

  it("keeps weekdays fixed and rotates each user's hour across ten weeks", () => {
    const now = Date.parse("2026-10-14T09:00:00Z");
    const slots = Array.from({ length: 10 }, (_, i) =>
      discoverySchedule("users:one", now + i * 7 * 86400000, "weekly"),
    );
    expect(new Set(slots.map((s) => s.weekday)).size).toBe(1);
    expect(new Set(slots.map((s) => s.bucket)).size).toBe(10);
    expect(discoverySchedule("users:one", now, "daily").bucket).toBe(
      discoverySchedule("users:one", now + 7 * 86400000, "daily").bucket,
    );
  });

  it("uses Sunday at Israel midnight for weekly eligibility", () => {
    const saturday = Date.parse("2026-10-17T20:59:59Z");
    const sunday = Date.parse("2026-10-17T21:00:00Z");
    expect(alreadyAttemptedInPeriod(saturday, sunday, "weekly")).toBe(false);
    expect(
      alreadyAttemptedInPeriod(sunday, sunday + 5 * 86400000, "weekly"),
    ).toBe(true);
    expect(alreadyAttemptedInPeriod(undefined, sunday, "weekly")).toBe(false);
  });

  it("uses Israel time across the daylight saving change", () => {
    expect(israelDiscoveryBucket(Date.parse("2026-10-24T05:07:00Z"))).toBe(0);
    expect(israelDiscoveryBucket(Date.parse("2026-10-25T06:07:00Z"))).toBe(0);
    const saturday = Date.parse("2026-10-24T20:59:59Z");
    const sunday = Date.parse("2026-10-24T21:00:00Z");
    expect(alreadyAttemptedInPeriod(saturday, sunday, "weekly")).toBe(false);
    expect(
      alreadyAttemptedInPeriod(
        Date.parse("2026-10-25T00:00:00Z"),
        Date.parse("2026-10-25T06:00:00Z"),
        "daily",
      ),
    ).toBe(true);
  });
});
