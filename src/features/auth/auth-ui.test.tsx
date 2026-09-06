import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import i18n, { initializeI18n } from "@/i18n";
import { AuthGate } from "./auth-gate";
import { AuthenticatedHome } from "./authenticated-home";
import { hasOAuthAttemptPending } from "./oauth-callback";
import { SignInScreen } from "./sign-in-screen";

const authActions = vi.hoisted(() => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => authActions,
}));

describe("authentication UI", () => {
  beforeAll(async () => {
    await initializeI18n();
  });

  beforeEach(async () => {
    authActions.signIn.mockReset();
    authActions.signOut.mockReset();
    await i18n.changeLanguage("en");
  });

  it("starts Google OAuth with a same-origin return and prevents duplicate clicks", async () => {
    const user = userEvent.setup();
    authActions.signIn.mockReturnValue(new Promise(() => undefined));
    render(<SignInScreen />);

    const button = screen.getByRole("button", { name: "Continue with Google" });
    await user.click(button);

    expect(authActions.signIn).toHaveBeenCalledWith("google", {
      redirectTo: "http://localhost:5173",
    });
    expect(button).toBeDisabled();
    expect(hasOAuthAttemptPending(window.sessionStorage)).toBe(true);

    await user.click(button);
    expect(authActions.signIn).toHaveBeenCalledTimes(1);
  });

  it("recovers when the initial OAuth request fails", async () => {
    const user = userEvent.setup();
    authActions.signIn.mockRejectedValue(new Error("provider unavailable"));
    render(<SignInScreen />);

    const button = screen.getByRole("button", { name: "Continue with Google" });
    await user.click(button);

    expect(
      await screen.findByText(
        "We couldn't connect to Google. Please try again.",
      ),
    ).toBeVisible();
    expect(button).toBeEnabled();
    expect(hasOAuthAttemptPending(window.sessionStorage)).toBe(false);
  });

  it("exposes the correct access boundary for each auth state", async () => {
    const onDismiss = vi.fn();
    const { rerender } = render(
      <AuthGate
        isAuthenticated={false}
        isLoading={true}
        callbackStatus="idle"
        onDismissCallbackError={onDismiss}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Checking your session",
    );

    rerender(
      <AuthGate
        isAuthenticated={false}
        isLoading={false}
        callbackStatus="idle"
        onDismissCallbackError={onDismiss}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Continue with Google" }),
    ).toBeInTheDocument();

    rerender(
      <AuthGate
        isAuthenticated={true}
        isLoading={false}
        callbackStatus="idle"
        onDismissCallbackError={onDismiss}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Sign out" }),
    ).toBeInTheDocument();

    rerender(
      <AuthGate
        isAuthenticated={true}
        isLoading={false}
        callbackStatus="exchanging"
        onDismissCallbackError={onDismiss}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Finishing your secure sign-in",
    );
  });

  it("allows recovery from a callback error", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(
      <AuthGate
        isAuthenticated={false}
        isLoading={false}
        callbackStatus="error"
        onDismissCallbackError={onDismiss}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("recovers when sign-out fails", async () => {
    const user = userEvent.setup();
    authActions.signOut.mockRejectedValue(new Error("storage unavailable"));
    render(<AuthenticatedHome />);

    const button = screen.getByRole("button", { name: "Sign out" });
    await user.click(button);

    expect(authActions.signOut).toHaveBeenCalledOnce();
    expect(
      await screen.findByText("We couldn't sign you out. Please try again."),
    ).toBeVisible();
    expect(button).toBeEnabled();
  });

  it("switches the existing auth UI between English LTR and Hebrew RTL", async () => {
    const user = userEvent.setup();
    authActions.signIn.mockReturnValue(new Promise(() => undefined));
    render(<SignInScreen />);

    expect(document.documentElement).toHaveAttribute("lang", "en");
    expect(document.documentElement).toHaveAttribute("dir", "ltr");

    await user.click(
      screen.getByRole("button", { name: "Switch language to Hebrew" }),
    );

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute("lang", "he");
      expect(document.documentElement).toHaveAttribute("dir", "rtl");
    });
    expect(
      screen.getByRole("button", { name: "המשך עם Google" }),
    ).toBeVisible();
  });
});
