import { afterEach, expect, it, vi } from "vitest";
import { onRequestError, register } from "./instrumentation";
const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  tags: vi.fn(),
  user: vi.fn(),
  token: vi.fn(),
  fetchQuery: vi.fn(),
  init: vi.fn(),
}));
vi.mock("@sentry/nextjs", () => ({
  getClient: () => ({}),
  captureRequestError: mocks.capture,
  withScope: (callback: (scope: unknown) => void) =>
    callback({ setTags: mocks.tags, setUser: mocks.user }),
  init: mocks.init,
}));
vi.mock("@convex-dev/auth/nextjs/server", () => ({
  convexAuthNextjsToken: mocks.token,
}));
vi.mock("convex/nextjs", () => ({ fetchQuery: mocks.fetchQuery }));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
const request = { path: "/profile", method: "GET", headers: {} };
const context = {
  revalidateReason: undefined,
  routerKind: "App Router" as const,
  routePath: "/profile",
  routeType: "render" as const,
};
it("forwards the original server exception with digest, stack and verified opaque identity", async () => {
  const error = Object.assign(new TypeError("Missing profile state"), {
    digest: "12345",
  });
  mocks.token.mockResolvedValue("verified-session");
  mocks.fetchQuery.mockResolvedValue("j57abcdef0123456789abcdef01234567");
  await onRequestError(error, request, context);
  expect(mocks.capture).toHaveBeenCalledWith(error, request, context);
  expect(mocks.capture.mock.calls[0][0].stack).toContain(
    "Missing profile state",
  );
  expect(mocks.tags).toHaveBeenCalledWith({ digest: "12345" });
  expect(mocks.user).toHaveBeenCalledWith({
    id: "j57abcdef0123456789abcdef01234567",
  });
});
it("still captures when request/session lookup fails, without leaking another request's user", async () => {
  const error = new Error("Root layout failed");
  mocks.token.mockRejectedValue(new Error("No request context"));
  await onRequestError(error, request, context);
  expect(mocks.capture).toHaveBeenCalledWith(error, request, context);
  expect(mocks.user).toHaveBeenCalledWith(null);
});
it("initializes both Node and Edge with diagnostic-preserving privacy hooks", async () => {
  vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://public@example.com/1");
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
  await register();
  vi.stubEnv("NEXT_RUNTIME", "edge");
  await register();
  expect(mocks.init).toHaveBeenCalledTimes(2);
  for (const [options] of mocks.init.mock.calls) {
    expect(options.sendDefaultPii).toBe(false);
    const cleaned = options.beforeSend({
      exception: { values: [{ type: "Error", value: "Root layout failed" }] },
    });
    expect(cleaned.exception.values[0].value).toBe("Root layout failed");
  }
});

it("reports the original error even if identity lookup hangs", async () => {
  vi.useFakeTimers();
  mocks.token.mockResolvedValue("verified-session");
  mocks.fetchQuery.mockImplementation(() => new Promise(() => {}));
  const error = new Error("Server render failed");
  const reported = onRequestError(error, request, context);
  await vi.advanceTimersByTimeAsync(500);
  await reported;
  expect(mocks.capture).toHaveBeenCalledWith(error, request, context);
  expect(mocks.user).toHaveBeenCalledWith(null);
});
