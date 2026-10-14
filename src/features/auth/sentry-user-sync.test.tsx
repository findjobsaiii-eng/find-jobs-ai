import { act, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ConvexProvider, type ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";
import * as Sentry from "@sentry/nextjs";
import { SentryUserSync } from "./sentry-user-sync";
const state = vi.hoisted(() => ({
  authenticated: true,
  userId: "j57abcdef0123456789abcdef01234567" as string | undefined | Error,
}));
vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useConvexAuth: () => ({ isAuthenticated: state.authenticated }),
}));
// Use the real useQueries subscription hook. Mock only the transport so tests
// also detect render loops caused by changing its query object each render.
const client = {
  watchQuery: () => ({
    localQueryResult: () => {
      if (state.userId instanceof Error) throw state.userId;
      return state.userId;
    },
    onUpdate: (callback: () => void) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
  }),
} as unknown as ConvexReactClient;
const listeners = new Set<() => void>();
function notifyQueryUpdate() {
  act(() => {
    for (const listener of listeners) listener();
  });
}
function Provider({ children }: { children: ReactNode }) {
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
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
  const view = render(<SentryUserSync />, { wrapper: Provider });
  expect(Sentry.setUser).toHaveBeenLastCalledWith({ id: state.userId });
  state.authenticated = false;
  view.rerender(<SentryUserSync />);
  expect(Sentry.setUser).toHaveBeenLastCalledWith(null);
  state.authenticated = true;
  state.userId = undefined;
  view.rerender(<SentryUserSync />);
  expect(Sentry.setUser).toHaveBeenLastCalledWith(null);
  state.userId = "j57abcdef0123456789abcdef01234568";
  notifyQueryUpdate();
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
  const view = render(<Page />, { wrapper: Provider });
  const error = new Error(
    "[CONVEX Q(telemetry:getCurrentUserId)] [Request ID: abc123] Server Error",
  );
  state.userId = error;
  notifyQueryUpdate();
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
  notifyQueryUpdate();
  view.rerender(<Page />);
  expect(Sentry.setUser).toHaveBeenLastCalledWith({ id: state.userId });
});
