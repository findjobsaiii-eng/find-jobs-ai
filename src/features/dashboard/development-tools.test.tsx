import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DirectionProvider } from "@base-ui/react/direction-provider";
import i18n, { initializeI18n } from "@/i18n";
import { DevelopmentTools } from "./development-tools";

const hooks = vi.hoisted(() => ({
  state: { plan: "free", runActive: false },
  discover: vi.fn(),
  setPlan: vi.fn(),
}));
vi.mock("convex/react", () => ({
  useQuery: () => hooks.state,
  useAction: () => hooks.discover,
  useMutation: () => hooks.setPlan,
}));

function TestTools() {
  return (
    <DirectionProvider direction={i18n.dir()}>
      <DevelopmentTools onEdit={vi.fn()} />
    </DirectionProvider>
  );
}

describe("development discovery controls", () => {
  beforeAll(async () => {
    await initializeI18n();
  });
  beforeEach(async () => {
    hooks.state = { plan: "free", runActive: false };
    hooks.discover.mockReset().mockResolvedValue({ resultSource: "central" });
    hooks.setPlan
      .mockReset()
      .mockImplementation(async ({ plan }: { plan: string }) => {
        hooks.state = { ...hooks.state, plan };
      });
    await i18n.changeLanguage("en");
  });

  it("switches free/paid mode and allows repeated test searches without waiting", async () => {
    const user = userEvent.setup();
    const view = render(<TestTools />);
    await user.click(screen.getByRole("button", { name: "Development tools" }));
    const toggle = screen.getByRole("switch", { name: "Subscribed" });
    expect(toggle).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Refresh jobs" }));
    expect(hooks.discover).toHaveBeenCalledExactlyOnceWith({});
    expect(screen.getByRole("button", { name: "Refresh jobs" })).toBeEnabled();
    await user.click(toggle);
    view.rerender(<TestTools />);
    expect(hooks.setPlan).toHaveBeenCalledExactlyOnceWith({ plan: "pro" });
    expect(toggle).toBeChecked();
    hooks.discover.mockResolvedValue({ resultSource: "fresh" });
    await user.click(screen.getByRole("button", { name: "Search now" }));
    await user.click(screen.getByRole("button", { name: "Search now" }));
    expect(hooks.discover).toHaveBeenCalledTimes(3);
    await user.click(toggle);
    view.rerender(<TestTools />);
    expect(hooks.setPlan).toHaveBeenLastCalledWith({ plan: "free" });
    expect(screen.getByRole("button", { name: "Refresh jobs" })).toBeEnabled();
  }, 10_000);

  it("prevents duplicate submits only while a request is in flight and recovers after failure", async () => {
    const user = userEvent.setup();
    let reject!: (reason: unknown) => void;
    hooks.discover.mockReturnValue(
      new Promise((_resolve, rejectPromise) => {
        reject = rejectPromise;
      }),
    );
    render(<TestTools />);
    await user.click(screen.getByRole("button", { name: "Development tools" }));
    await user.click(screen.getByRole("button", { name: "Refresh jobs" }));
    const pending = screen.getByRole("button", { name: "Updating jobs…" });
    expect(pending).toBeDisabled();
    expect(screen.getByRole("switch")).toBeDisabled();
    await user.click(pending);
    expect(hooks.discover).toHaveBeenCalledOnce();
    await act(async () => reject(new Error("unavailable")));
    expect(screen.getByRole("alert")).toBeVisible();
    expect(screen.getByRole("button", { name: "Refresh jobs" })).toBeEnabled();
    expect(screen.getByRole("switch")).toBeEnabled();
  });

  it("supports changing the subscription by keyboard in Hebrew", async () => {
    await i18n.changeLanguage("he");
    const user = userEvent.setup();
    const view = render(<TestTools />);
    await user.click(screen.getByRole("button", { name: "כלי פיתוח" }));
    const toggle = screen.getByRole("switch", { name: "משתמש מנוי" });
    toggle.focus();
    await user.keyboard(" ");
    view.rerender(<TestTools />);
    expect(toggle).toBeChecked();
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    expect(screen.getByRole("button", { name: "חיפוש עכשיו" })).toBeEnabled();
  });
});
