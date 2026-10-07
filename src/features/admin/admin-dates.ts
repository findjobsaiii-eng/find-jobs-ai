const DAY_MS = 24 * 60 * 60 * 1_000;
const zone = "Asia/Jerusalem";

export function israelDateKey(timestamp = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(timestamp);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function isValidAdminDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || Number(value.slice(0, 4)) < 1000)
    return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return (
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
  );
}

function israelMidnight(desiredUtc: number) {
  let guess = desiredUtc;
  for (let iteration = 0; iteration < 2; iteration++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(guess)
      .reduce<Record<string, number>>((result, part) => {
        if (part.type !== "literal") result[part.type] = Number(part.value);
        return result;
      }, {});
    const representedUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    guess -= representedUtc - desiredUtc;
  }
  return guess;
}

export function dateRange(dateKey: string) {
  if (!isValidAdminDateKey(dateKey)) throw new RangeError("Invalid admin date");
  const midnightUtc = Date.parse(`${dateKey}T00:00:00Z`);
  return {
    start: israelMidnight(midnightUtc),
    end: israelMidnight(midnightUtc + DAY_MS),
  };
}

export function formatDateTime(value: number | null, language: string) {
  if (value === null || !Number.isFinite(new Date(value).getTime())) return "—";
  return new Intl.DateTimeFormat(language, {
    timeZone: zone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export function formatShortDate(value: number, language: string) {
  if (!Number.isFinite(new Date(value).getTime())) return "—";
  return new Intl.DateTimeFormat(language, {
    timeZone: zone,
    month: "short",
    day: "numeric",
  }).format(value);
}
