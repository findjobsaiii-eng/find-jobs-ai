import { act, fireEvent, render, screen } from "@testing-library/react";
import Link from "next/link";
import { beforeAll, beforeEach, afterEach, expect, it, vi } from "vitest";
import i18n, { initializeI18n } from "@/i18n";
import { InterfaceSoundsProvider } from "./interface-sounds-provider";
import { interactionCue } from "./interaction-cue";
import { SoundToggle } from "./sound-toggle";
import { SOUND_PREFERENCE_KEY, setSoundEnabled } from "./sound-preference";

const audio = vi.hoisted(() => ({
  unlock: vi.fn(async () => true),
  play: vi.fn(),
  setEnabled: vi.fn(),
  stopAll: vi.fn(),
  destroy: vi.fn(async () => {}),
}));
vi.mock("uisfx", () => ({ createUISFX: () => audio }));
let click: (event: MouseEvent) => void;
let input: (event: Event) => void;

beforeAll(async () => {
  await initializeI18n();
});
beforeEach(async () => {
  vi.clearAllMocks();
  audio.unlock.mockResolvedValue(true);
  setSoundEnabled(true);
  await i18n.changeLanguage("en");
  vi.spyOn(performance, "now").mockReturnValue(1000);
  const original = document.addEventListener.bind(document);
  vi.spyOn(document, "addEventListener").mockImplementation(
    (type, listener, options) => {
      if (type === "click" && options === true)
        click = listener as (event: MouseEvent) => void;
      if (type === "input" && options === true)
        input = listener as (event: Event) => void;
      original(type, listener, options);
    },
  );
});
afterEach(() => {
  vi.restoreAllMocks();
});

function gesture(target: Element, overrides: Partial<MouseEvent> = {}) {
  click({ target, isTrusted: true, button: 0, ...overrides } as MouseEvent);
}

it("adds quiet detents to slider value changes and throttles continuous dragging", async () => {
  render(
    <InterfaceSoundsProvider>
      <input type="range" aria-label="Travel distance" />
    </InterfaceSoundsProvider>,
  );
  const slider = screen.getByRole("slider", { name: "Travel distance" });
  const change = () =>
    input({ target: slider, isTrusted: true } as unknown as Event);
  fireEvent.input(slider); // Programmatic updates do not produce audio.
  expect(audio.unlock).not.toHaveBeenCalled();
  await act(async () => {
    change();
    change();
  });
  expect(audio.play).toHaveBeenCalledExactlyOnceWith("snap");
  vi.mocked(performance.now).mockReturnValue(1119);
  change();
  expect(audio.unlock).toHaveBeenCalledTimes(1);
  vi.mocked(performance.now).mockReturnValue(1120);
  await act(async () => {
    change();
  });
  expect(audio.play).toHaveBeenCalledTimes(2);
  act(() => setSoundEnabled(false));
  vi.mocked(performance.now).mockReturnValue(1300);
  change();
  expect(audio.play).toHaveBeenCalledTimes(2);
});

it("keeps video volume, disabled sliders and typing silent", () => {
  render(
    <InterfaceSoundsProvider>
      <div className="marketing-video-frame">
        <input type="range" aria-label="Video volume" />
      </div>
      <input type="range" disabled aria-label="Disabled slider" />
      <input type="range" data-ui-sound="off" aria-label="Silent slider" />
      <input type="text" aria-label="Typing" />
    </InterfaceSoundsProvider>,
  );
  for (const target of document.querySelectorAll("input")) {
    input({ target, isTrusted: true } as unknown as Event);
  }
  expect(audio.unlock).not.toHaveBeenCalled();
});

it("plays once for a trusted activation, with no startup or hover audio", async () => {
  render(
    <InterfaceSoundsProvider>
      <button>Next</button>
    </InterfaceSoundsProvider>,
  );
  const button = screen.getByRole("button", { name: "Next" });
  expect(audio.unlock).not.toHaveBeenCalled();
  fireEvent.pointerOver(button);
  fireEvent.click(button); // Synthetic events never unlock audio.
  expect(audio.unlock).not.toHaveBeenCalled();
  await act(async () => {
    gesture(button);
    gesture(button);
  });
  expect(audio.play).toHaveBeenCalledExactlyOnceWith("press");
});

it("persists mute, synchronizes controls and prevents a delayed cue after mute", async () => {
  let resume!: (value: boolean) => void;
  audio.unlock.mockReturnValue(
    new Promise((resolve) => {
      resume = resolve;
    }),
  );
  render(
    <InterfaceSoundsProvider>
      <SoundToggle />
      <button>Next</button>
    </InterfaceSoundsProvider>,
  );
  gesture(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Mute interface sounds" }),
  );
  expect(localStorage.getItem(SOUND_PREFERENCE_KEY)).toBe("off");
  expect(audio.setEnabled).toHaveBeenLastCalledWith(false);
  await act(async () => {
    resume(true);
  });
  expect(audio.play).not.toHaveBeenCalled();
  gesture(screen.getByRole("button", { name: "Next" }));
  expect(audio.unlock).toHaveBeenCalledTimes(1);
  fireEvent.click(
    screen.getByRole("button", { name: "Enable interface sounds" }),
  );
  expect(audio.setEnabled).toHaveBeenLastCalledWith(true);
});

it("loads saved mute and responds to another tab's preference", () => {
  localStorage.setItem(SOUND_PREFERENCE_KEY, "off");
  render(
    <InterfaceSoundsProvider>
      <SoundToggle />
    </InterfaceSoundsProvider>,
  );
  expect(
    screen.getByRole("button", { name: "Enable interface sounds" }),
  ).toHaveAttribute("aria-pressed", "false");
  act(() => {
    localStorage.setItem(SOUND_PREFERENCE_KEY, "on");
    window.dispatchEvent(
      new StorageEvent("storage", { key: SOUND_PREFERENCE_KEY }),
    );
  });
  expect(
    screen.getByRole("button", { name: "Mute interface sounds" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(audio.setEnabled).toHaveBeenLastCalledWith(true);
});

it("remains usable when browser storage is unavailable, including Hebrew", async () => {
  await i18n.changeLanguage("he");
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  render(<SoundToggle />);
  fireEvent.click(screen.getByRole("button", { name: "השתקת צלילי ממשק" }));
  expect(
    screen.getByRole("button", { name: "הפעלת צלילי ממשק" }),
  ).toHaveAttribute("aria-pressed", "false");
});

it("never competes with playing media or altered navigation gestures", async () => {
  render(
    <InterfaceSoundsProvider>
      <button>Next</button>
      <video />
    </InterfaceSoundsProvider>,
  );
  const button = screen.getByRole("button", { name: "Next" });
  const video = document.querySelector("video")!;
  Object.defineProperty(video, "paused", { value: false, configurable: true });
  await act(async () => {
    gesture(button);
  });
  expect(audio.unlock).not.toHaveBeenCalled();
  Object.defineProperty(video, "paused", { value: true });
  gesture(button, { ctrlKey: true });
  expect(audio.unlock).not.toHaveBeenCalled();
});

it("cleans up the player and ignores unlock completion after unmount", async () => {
  let resume!: (value: boolean) => void;
  audio.unlock.mockReturnValue(
    new Promise((resolve) => {
      resume = resolve;
    }),
  );
  const view = render(
    <InterfaceSoundsProvider>
      <button>Next</button>
    </InterfaceSoundsProvider>,
  );
  gesture(screen.getByRole("button", { name: "Next" }));
  view.unmount();
  await act(async () => {
    resume(true);
  });
  expect(audio.destroy).toHaveBeenCalledTimes(1);
  expect(audio.play).not.toHaveBeenCalled();
});

it("maps semantic controls and excludes disabled, typing and video controls", () => {
  const { container } = render(
    <>
      <Link href="/profile">
        <span>Profile</span>
      </Link>
      <button aria-expanded="false">Open</button>
      <button role="switch" aria-checked="true">
        Switch
      </button>
      <button disabled>Disabled</button>
      <input aria-label="Typing" />
      <div className="marketing-video-frame">
        <button>Play</button>
      </div>
    </>,
  );
  expect(interactionCue(screen.getByText("Profile"))).toBe("forward");
  expect(interactionCue(screen.getByText("Open"))).toBe("open");
  expect(interactionCue(screen.getByText("Switch"))).toBe("toggle-off");
  expect(interactionCue(screen.getByText("Disabled"))).toBeNull();
  expect(interactionCue(container.querySelector("input"))).toBeNull();
  expect(interactionCue(screen.getByText("Play"))).toBeNull();
});
