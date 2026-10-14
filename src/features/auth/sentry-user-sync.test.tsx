import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/nextjs";
import { SentryUserSync } from "./sentry-user-sync";
const state = vi.hoisted(() => ({
  authenticated: true,
  userId: "j57abcdef0123456789abcdef01234567" as string | undefined | Error,
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: state.authenticated }),
  useQueries: () => ({ userId: state.userId }),
}));
vi.mock("@sentry/nextjs", () => ({
  setUser: vi.fn(),
  captureException: vi.fn(),
}));
beforeEach(() => {
  state.authenticated = true;
  state.userId = "j57abcdef0123456789abcdef01234567";
  vi.clearAllMocks();
});
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

it("keeps the page available when diagnostic identity fails and reports the original error", () => {
  function Page() {
    return (
      <>
        <SentryUserSync />
        <p>Application content</p>
      </>
    );
  }
  const view = render(<Page />);
  const error = new Error(
    "[CONVEX Q(telemetry:getCurrentUserId)] [Request ID: abc123] Server Error",
  );
  state.userId = error;
  view.rerender(<Page />);
  expect(screen.getByText("Application content")).toBeInTheDocument();
  expect(Sentry.setUser).toHaveBeenLastCalledWith(null);
  expect(Sentry.captureException).toHaveBeenCalledWith(error, {
    tags: {
      boundary: "telemetry-identity",
      convex_function: "telemetry:getCurrentUserId",
      convex_request_id: "abc123",
    },
  });
  expect(Sentry.captureException).toHaveBeenCalledOnce();
  view.rerender(<Page />);
  expect(Sentry.captureException).toHaveBeenCalledOnce();
  state.userId = "j57abcdef0123456789abcdef01234568";
  view.rerender(<Page />);
  expect(Sentry.setUser).toHaveBeenLastCalledWith({ id: state.userId });
});
