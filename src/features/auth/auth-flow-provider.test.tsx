import { useContext } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthFlowContext } from "./auth-flow-context";
import { AuthFlowProvider } from "./auth-flow-provider";
import { markOAuthAttemptPending } from "./oauth-callback";

const authMocks = vi.hoisted(() => ({
  isAuthenticated: false,
  isLoading: false,
}));

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({
    isAuthenticated: authMocks.isAuthenticated,
    isLoading: authMocks.isLoading,
  }),
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
    authMocks.isLoading = false;
    window.history.replaceState(null, "", "/");
    window.sessionStorage.clear();
  });

  it("waits for the server-side callback exchange to finish", () => {
    authMocks.isLoading = true;
    markOAuthAttemptPending(window.sessionStorage);
    render(
      <AuthFlowProvider>
        <FlowState />
      </AuthFlowProvider>,
    );

    expect(screen.getByRole("button")).toHaveTextContent("awaiting-session");
  });

  it("clears a pending attempt after the server establishes a session", async () => {
    markOAuthAttemptPending(window.sessionStorage);
    authMocks.isAuthenticated = true;

    render(
      <AuthFlowProvider>
        <FlowState />
      </AuthFlowProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button")).toHaveTextContent("idle");
    });
    expect(window.sessionStorage.length).toBe(0);
  });

  it("surfaces an unsuccessful server-side callback exchange", async () => {
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
  });
});
