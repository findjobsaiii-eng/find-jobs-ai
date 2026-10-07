import { afterEach, expect, it, vi } from "vitest";
import {
  dateRange,
  formatDateTime,
  formatShortDate,
  isValidAdminDateKey,
  israelDateKey,
} from "./admin-dates";

afterEach(() => vi.restoreAllMocks());

it("constructs an ISO date key even when localized date formatting uses slashes", () => {
  vi.spyOn(
    Intl.DateTimeFormat.prototype as { format: unknown },
    "format",
    "get",
  ).mockReturnValue(() => "10/7/2026");
  expect(israelDateKey(Date.parse("2026-10-06T22:00:00Z"))).toBe("2026-10-07");
});

it("rejects cleared, partial, localized and impossible calendar dates", () => {
  for (const value of [
    "",
    "2026-10-",
    "10/7/2026",
    "2026-02-29",
    "2026-02-31",
    "2026-13-01",
  ])
    expect(isValidAdminDateKey(value)).toBe(false);
  expect(isValidAdminDateKey("2024-02-29")).toBe(true);
  expect(() => dateRange("")).toThrow(RangeError);
});

it("uses Jerusalem midnight rather than UTC midnight for admin queries", () => {
  expect(dateRange("2026-10-07")).toEqual({
    start: Date.parse("2026-10-06T21:00:00Z"),
    end: Date.parse("2026-10-07T21:00:00Z"),
  });
});

it("covers the complete 23-hour and 25-hour daylight-saving days", () => {
  const spring = dateRange("2026-03-27"),
    autumn = dateRange("2026-10-25");
  expect(spring.end - spring.start).toBe(23 * 60 * 60_000);
  expect(autumn.end - autumn.start).toBe(25 * 60 * 60_000);
});

it("keeps invalid diagnostic timestamps from crashing a table", () => {
  for (const value of [NaN, Infinity, 9e15]) {
    expect(formatDateTime(value, "en")).toBe("—");
    expect(formatShortDate(value, "he")).toBe("—");
  }
  expect(formatDateTime(null, "en")).toBe("—");
  expect(formatDateTime(Date.parse("2026-10-07T10:00:00Z"), "he")).not.toBe(
    "—",
  );
});
