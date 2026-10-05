import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const posthog = vi.hoisted(() => ({
  init: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
  startSessionRecording: vi.fn(),
  stopSessionRecording: vi.fn(),
  reset: vi.fn(),
  capture: vi.fn(),
  identify: vi.fn(),
}));
vi.mock("posthog-js", () => ({ default: posthog }));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "public-test-key");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
});
afterEach(() => vi.unstubAllEnvs());
async function setup() {
  const analytics = await import("./analytics");
  const consent = await import("./cookie-consent");
  return { ...analytics, ...consent };
}

describe("consent-controlled replay", () => {
  it("does not initialize or record with missing, declined or superseded consent", async () => {
    const { syncAnalyticsConsent, saveCookieConsent, captureProductEvent } =
      await setup();
    await syncAnalyticsConsent(true);
    saveCookieConsent(false);
    await syncAnalyticsConsent(true);
    localStorage.setItem(
      "jobmiter-cookie-consent",
      JSON.stringify({
        version: "2026-09-22",
        analytics: true,
        decidedAt: new Date().toISOString(),
      }),
    );
    await syncAnalyticsConsent(true);
    await captureProductEvent("resume_uploaded");
    expect(posthog.init).not.toHaveBeenCalled();
    expect(posthog.startSessionRecording).not.toHaveBeenCalled();
    expect(posthog.capture).not.toHaveBeenCalled();
  });
  it("records after opting in and forwards recorder snapshots intact", async () => {
    const { syncAnalyticsConsent, saveCookieConsent, SESSION_REPLAY_OPTIONS } =
      await setup();
    saveCookieConsent(true);
    await syncAnalyticsConsent(true);
    expect(posthog.startSessionRecording).toHaveBeenCalledOnce();
    const config = posthog.init.mock.calls[0][1];
    expect(config.session_recording).toBe(SESSION_REPLAY_OPTIONS);
    const snapshot = {
      event: "$snapshot",
      properties: {
        $snapshot_data: { css: ".screen{display:grid}", text: "Continue" },
      },
    };
    expect(config.before_send(snapshot)).toBe(snapshot);
  });
  it("stops recording and resets identity on consent withdrawal", async () => {
    const { syncAnalyticsConsent, saveCookieConsent, setAnalyticsIdentity } =
      await setup();
    saveCookieConsent(true);
    await syncAnalyticsConsent(true);
    await setAnalyticsIdentity("opaque-user-id");
    expect(posthog.identify).toHaveBeenCalledWith("opaque-user-id");
    saveCookieConsent(false);
    await syncAnalyticsConsent(false);
    expect(posthog.stopSessionRecording).toHaveBeenCalledOnce();
    expect(posthog.opt_out_capturing).toHaveBeenCalledOnce();
    expect(posthog.reset).toHaveBeenCalledOnce();
  });
  it("does not start a deferred SDK import after the user withdraws consent", async () => {
    const { syncAnalyticsConsent, saveCookieConsent } = await setup();
    saveCookieConsent(true);
    const loading = syncAnalyticsConsent(true);
    saveCookieConsent(false);
    await syncAnalyticsConsent(false);
    await loading;
    expect(posthog.init).not.toHaveBeenCalled();
    expect(posthog.startSessionRecording).not.toHaveBeenCalled();
  });
  it("keeps replay navigation paths while stripping query credentials and fragments", async () => {
    const { SESSION_REPLAY_OPTIONS } = await setup();
    const request = {
      name: "https://jobmiter.com/profile?token=secret#private",
      initiatorType: "navigation" as const,
      isInitial: true,
      duration: 0,
      entryType: "navigation",
      startTime: 0,
    };
    expect(
      SESSION_REPLAY_OPTIONS.maskCapturedNetworkRequestFn(request)?.name,
    ).toBe("https://jobmiter.com/profile");
  });
});
