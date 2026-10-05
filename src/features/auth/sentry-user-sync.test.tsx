import { render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import * as Sentry from "@sentry/nextjs";
import { SentryUserSync } from "./sentry-user-sync";
const state = vi.hoisted(() => ({
  authenticated: true,
  userId: "j57abcdef0123456789abcdef01234567" as string | undefined,
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: state.authenticated }),
  useQuery: () => state.userId,
}));
vi.mock("@sentry/nextjs", () => ({ setUser: vi.fn() }));
it("sets only the internal ID and clears it on logout, pending identity and unmount", () => {
  const view = render(<SentryUserSync />);
  expect(Sentry.setUser).toHaveBeenLastCalledWith({ id: state.userId });
  state.authenticated = false;
  view.rerender(<SentryUserSync />);
  expect(Sentry.setUser).toHaveBeenLastCalledWith(null);
  state.authenticated = true;
  state.userId = undefined;
  view.rerender(<SentryUserSync />);
  expect(Sentry.setUser).toHaveBeenLastCalledWith(null);
  state.userId = "j57abcdef0123456789abcdef01234568";
  view.rerender(<SentryUserSync />);
  expect(Sentry.setUser).toHaveBeenLastCalledWith({ id: state.userId });
  view.unmount();
  expect(Sentry.setUser).toHaveBeenLastCalledWith(null);
});
