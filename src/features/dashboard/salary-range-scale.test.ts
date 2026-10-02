import { expect, it } from "vitest";
import { salaryRangeScale } from "./salary-range-scale";
it("positions monthly shekel salaries on the common 10k–50k scale", () => {
  expect(salaryRangeScale(16000, 24000, "ILS", "month")).toEqual({
    start: 15,
    end: 35,
  });
  expect(salaryRangeScale(10000, 50000, "ILS", "month")).toEqual({
    start: 0,
    end: 100,
  });
});
it("pads salaries outside that scale and preserves exact amounts as points", () => {
  const outside = salaryRangeScale(60000, 80000, "ILS", "month")!;
  expect(outside.start).toBeCloseTo(18.75);
  expect(outside.end).toBeCloseTo(81.25);
  const hourly = salaryRangeScale(100, 200, "ILS", "hour")!;
  expect(hourly.start).toBeCloseTo(18.75);
  expect(hourly.end).toBeCloseTo(81.25);
  expect(salaryRangeScale(60000, 60000, "ILS", "month")).toEqual({
    start: 50,
    end: 50,
  });
});
it("does not draw a bounded salary band for unknown or invalid endpoints", () => {
  expect(salaryRangeScale(null, 20000, "ILS", "month")).toBeNull();
  expect(salaryRangeScale(20000, 10000, "ILS", "month")).toBeNull();
});
