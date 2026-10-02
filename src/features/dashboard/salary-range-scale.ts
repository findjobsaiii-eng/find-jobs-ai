/** Visual context only; these bounds never participate in salary filtering. */
export function salaryRangeScale(
  min: number | null,
  max: number | null,
  currency: string | undefined,
  period: string | null,
) {
  if (
    min === null ||
    max === null ||
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    min <= 0 ||
    max < min
  )
    return null;
  const standard =
    currency === "ILS" && period === "month" && min >= 10000 && max <= 50000;
  const padding = Math.max((max - min) * 0.3, max * 0.05, 1);
  const floor = standard ? 10000 : Math.max(0, min - padding);
  const ceiling = standard ? 50000 : max + padding;
  return {
    start: ((min - floor) / (ceiling - floor)) * 100,
    end: ((max - floor) / (ceiling - floor)) * 100,
  };
}
