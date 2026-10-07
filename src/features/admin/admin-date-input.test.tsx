import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AdminDateInput } from "./admin-date-input";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-07T10:00:00Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("retains the active date when the user clears or partially edits it", () => {
  const change = vi.fn();
  render(
    <AdminDateInput label="Date" value="2026-10-06" onValueChange={change} />,
  );
  const input = screen.getByLabelText("Date") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "" } });
  fireEvent.change(input, { target: { value: "2026-10-" } });
  expect(change).not.toHaveBeenCalled();
  expect(input.value).toBe("");
  fireEvent.blur(input);
  expect(input.value).toBe("2026-10-06");
});

it("accepts a valid date and refuses a date beyond today", () => {
  const change = vi.fn();
  render(
    <AdminDateInput label="Date" value="2026-10-06" onValueChange={change} />,
  );
  const input = screen.getByLabelText("Date");
  fireEvent.change(input, { target: { value: "2026-10-07" } });
  expect(change).toHaveBeenCalledWith("2026-10-07");
  change.mockClear();
  fireEvent.change(input, { target: { value: "2026-10-08" } });
  expect(change).not.toHaveBeenCalled();
});
