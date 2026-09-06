import { useContext } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthFlowContext } from "./auth-flow-context";
import { AuthFlowProvider } from "./auth-flow-provider";
import { markOAuthAttemptPending } from "./oauth-callback";

const authMocks = vi.hoisted(() => ({
  isAuthenticated: false,
  signIn: vi.fn(),
}));

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signIn: authMocks.signIn }),
}));

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: authMocks.isAuthenticated }),
}));

function FlowState() {
  const value = useContext(AuthFlowContext);

  if (!value) {
    return null;
  }

  return (
    <button type="button" onClick={value.dismissCallbackError}>
      {value.status}
    </button>
  );
}

describe("AuthFlowProvider", () => {
  beforeEach(() => {
    authMocks.isAuthenticated = false;
    authMocks.signIn.mockReset();
  });

  it("exchanges a callback code once and removes it from browser history", async () => {
    authMocks.signIn.mockResolvedValue({ signingIn: true });
    markOAuthAttemptPending(window.sessionStorage);
    window.history.replaceState(
      null,
      "",
      "/?code=one-time-code&next=jobs#details",
    );

    const { rerender } = render(
      <AuthFlowProvider>
        <FlowState />
      </AuthFlowProvider>,
    );

    expect(screen.getByRole("button")).toHaveTextContent("exchanging");
    await waitFor(() => {
      expect(authMocks.signIn).toHaveBeenCalledWith(undefined, {
        code: "one-time-code",
      });
    });
    expect(window.location.href).toBe(
      "http://localhost:5173/?next=jobs#details",
    );
    expect(window.sessionStorage.length).toBe(0);
    await waitFor(() => {
      expect(screen.getByRole("button")).toHaveTextContent("awaiting-session");
    });

    authMocks.isAuthenticated = true;
    rerender(
      <AuthFlowProvider>
        <FlowState />
      </AuthFlowProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button")).toHaveTextContent("idle");
    });
    expect(authMocks.signIn).toHaveBeenCalledTimes(1);
  });

  it("surfaces a failed callback exchange without retaining the code", async () => {
    authMocks.signIn.mockRejectedValue(new Error("exchange failed"));
    window.history.replaceState(null, "", "/?code=invalid-code");

    render(
      <AuthFlowProvider>
        <FlowState />
      </AuthFlowProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button")).toHaveTextContent("error");
    });
    expect(window.location.search).toBe("");
  });

  it("recognizes a provider callback that returned without a code", async () => {
    markOAuthAttemptPending(window.sessionStorage);

    render(
      <AuthFlowProvider>
        <FlowState />
      </AuthFlowProvider>,
    );

    expect(screen.getByRole("button")).toHaveTextContent("error");

    await act(async () => {
      screen.getByRole("button").click();
    });

    expect(screen.getByRole("button")).toHaveTextContent("idle");
    expect(window.sessionStorage.length).toBe(0);
    expect(authMocks.signIn).not.toHaveBeenCalled();
  });
});
