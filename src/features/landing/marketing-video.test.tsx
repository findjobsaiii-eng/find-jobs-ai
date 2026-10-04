import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import i18n, { initializeI18n } from "@/i18n";
import { MarketingVideo } from "./marketing-video";

const fullscreenDescriptors = Object.fromEntries(
  ["fullscreenElement", "exitFullscreen"].map((name) => [
    name,
    Object.getOwnPropertyDescriptor(document, name),
  ]),
);

describe("landing marketing video", () => {
  beforeAll(async () => {
    await initializeI18n();
  });
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    const media = window.matchMedia("(min-width: 768px)");
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      ...media,
      media: query,
      matches: false,
    }));
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (
      this: HTMLMediaElement,
    ) {
      Object.defineProperty(this, "paused", {
        configurable: true,
        value: false,
      });
      return Promise.resolve();
    });
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (
      this: HTMLMediaElement,
    ) {
      Object.defineProperty(this, "paused", {
        configurable: true,
        value: true,
      });
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    for (const [name, descriptor] of Object.entries(fullscreenDescriptors)) {
      if (descriptor) Object.defineProperty(document, name, descriptor);
      else Reflect.deleteProperty(document, name);
    }
  });

  function getVideo(container: HTMLElement) {
    return container.querySelector("video")!;
  }
  function toolbar() {
    return within(screen.getByRole("toolbar", { name: "Video controls" }));
  }
  async function startVideo(container: HTMLElement) {
    await userEvent.click(
      screen.getByRole("button", { name: "Watch the film" }),
    );
    const video = getVideo(container);
    fireEvent.playing(video);
    return video;
  }

  it("shows the invitation without downloading, autoplaying, or native controls", () => {
    const { container } = render(<MarketingVideo />);
    const video = getVideo(container);
    expect(
      screen.getByRole("button", { name: "Watch the film" }),
    ).toBeEnabled();
    expect(video).not.toHaveAttribute("src");
    expect(video).not.toHaveAttribute("autoplay");
    expect(video).toHaveAttribute("preload", "none");
    expect(video).not.toHaveAttribute("controls");
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it.each([
    [false, "Jobmiter-landing-web.mp4"],
    [true, "Jobmiter-desktop-web.mp4"],
  ])(
    "selects the correct source on keyboard activation (desktop: %s)",
    async (desktop, file) => {
      const media = window.matchMedia("(min-width: 768px)");
      vi.mocked(window.matchMedia).mockImplementation((query) => ({
        ...media,
        media: query,
        matches: query === "(min-width: 768px)" && desktop,
      }));
      const user = userEvent.setup();
      const { container } = render(<MarketingVideo />);
      const video = getVideo(container);
      screen.getByRole("button", { name: "Watch the film" }).focus();
      await user.keyboard("{Enter}");
      expect(video).toHaveAttribute(
        "src",
        `https://media.jobmiter.com/${file}`,
      );
      expect(video).toHaveAttribute("playsinline");
      expect(video).not.toHaveAttribute("controls");
      expect(document.activeElement).toHaveAccessibleName("Pause video");
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("status")).toHaveTextContent("Loading video");
      fireEvent.playing(video);
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(
        toolbar().getByRole("button", { name: "Pause video" }),
      ).toBeEnabled();
    },
  );

  it("recovers from rejected playback and subsequent network errors", async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(
      new Error("Playback failed"),
    );
    const user = userEvent.setup();
    const { container } = render(<MarketingVideo />);
    const video = getVideo(container);
    await user.click(screen.getByRole("button", { name: "Watch the film" }));
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    fireEvent.playing(video);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalledTimes(2);
    fireEvent.error(video);
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
    expect(screen.getByRole("alert")).toBeVisible();
  });

  it("pauses and resumes without resetting playback, exposes progress without seeking, and replays", async () => {
    const user = userEvent.setup();
    const { container } = render(<MarketingVideo />);
    const video = await startVideo(container);
    Object.defineProperty(video, "duration", { configurable: true, value: 32 });
    video.currentTime = 8;
    fireEvent.timeUpdate(video);
    const progress = screen.getByRole("progressbar", {
      name: "Video progress",
    });
    expect(progress).toHaveAttribute("aria-valuenow", "25");
    fireEvent.click(progress);
    expect(video.currentTime).toBe(8);
    expect(toolbar().getAllByRole("slider")).toHaveLength(1);
    expect(toolbar().getByRole("slider", { name: "Volume" })).toBeEnabled();
    await user.click(toolbar().getByRole("button", { name: "Pause video" }));
    expect(video.paused).toBe(true);
    expect(video.currentTime).toBe(8);
    const resume = toolbar().getByRole("button", { name: "Play video" });
    resume.focus();
    await user.keyboard("{Enter}");
    fireEvent.playing(video);
    expect(video.paused).toBe(false);
    expect(resume).toHaveFocus();
    expect(video.currentTime).toBe(8);
    expect(video).not.toHaveAttribute("controls");
    fireEvent.waiting(video);
    expect(screen.getByRole("status")).toBeInTheDocument();
    fireEvent.playing(video);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    video.currentTime = 32;
    fireEvent.ended(video);
    expect(screen.getByRole("button", { name: "Watch again" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Watch again" }));
    expect(video.currentTime).toBe(0);
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalledTimes(1);
  });

  it("changes audio volume, mutes, and restores the previous audible level", async () => {
    const user = userEvent.setup();
    const { container } = render(<MarketingVideo />);
    const video = await startVideo(container);
    const slider = toolbar().getByRole("slider", { name: "Volume" });
    fireEvent.change(slider, { target: { value: "0.4" } });
    expect(video.volume).toBe(0.4);
    expect(video.muted).toBe(false);
    await user.click(toolbar().getByRole("button", { name: "Mute" }));
    expect(video.muted).toBe(true);
    expect(slider).toHaveValue("0");
    await user.click(toolbar().getByRole("button", { name: "Unmute" }));
    expect(video.muted).toBe(false);
    expect(video.volume).toBe(0.4);
    fireEvent.change(slider, { target: { value: "0" } });
    await user.click(toolbar().getByRole("button", { name: "Unmute" }));
    expect(video.volume).toBe(0.4);
    expect(video.muted).toBe(false);
  });

  it("fullscreens the custom player and synchronizes after external fullscreen exit", async () => {
    const user = userEvent.setup();
    const { container } = render(<MarketingVideo />);
    const video = await startVideo(container);
    const frame = container.querySelector<HTMLDivElement>(
      ".marketing-video-frame",
    )!;
    frame.requestFullscreen = vi.fn().mockImplementation(async () => {
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        value: frame,
      });
      fireEvent(document, new Event("fullscreenchange"));
    });
    await user.click(toolbar().getByRole("button", { name: "Full screen" }));
    expect(frame.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(
      toolbar().getByRole("button", { name: "Exit full screen" }),
    ).toBeEnabled();
    expect(video).not.toHaveAttribute("controls");
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: null,
    });
    fireEvent(document, new Event("fullscreenchange"));
    expect(
      toolbar().getByRole("button", { name: "Full screen" }),
    ).toBeEnabled();
  });

  it("keeps custom controls in a full-window view if fullscreen is unavailable, and exits with Escape", async () => {
    const user = userEvent.setup();
    const { container } = render(<MarketingVideo />);
    const video = await startVideo(container);
    const frame = container.querySelector<HTMLDivElement>(
      ".marketing-video-frame",
    )!;
    await user.click(toolbar().getByRole("button", { name: "Full screen" }));
    expect(frame).toHaveStyle({ position: "fixed" });
    expect(document.body.style.overflow).toBe("hidden");
    expect(video).not.toHaveAttribute("controls");
    await user.keyboard("{Escape}");
    expect(
      toolbar().getByRole("button", { name: "Full screen" }),
    ).toBeEnabled();
    expect(frame.style.position).toBe("");
    expect(document.body.style.overflow).toBe("");
  });

  it("ignores a stale playback failure when the viewer pauses a pending request", async () => {
    let rejectPlay: (reason: Error) => void = () => {};
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(function (
      this: HTMLMediaElement,
    ) {
      Object.defineProperty(this, "paused", {
        configurable: true,
        value: false,
      });
      return new Promise<void>((_resolve, reject) => {
        rejectPlay = reject;
      });
    });
    const user = userEvent.setup();
    render(<MarketingVideo />);
    await user.click(screen.getByRole("button", { name: "Watch the film" }));
    await user.click(toolbar().getByRole("button", { name: "Pause video" }));
    rejectPlay(new Error("Interrupted"));
    await waitFor(() =>
      expect(
        toolbar().getByRole("button", { name: "Play video" }),
      ).toBeEnabled(),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("offers localized keyboard playback and error recovery in Hebrew", async () => {
    await i18n.changeLanguage("he");
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(
      new Error("Offline"),
    );
    const user = userEvent.setup();
    render(<MarketingVideo />);
    screen.getByRole("button", { name: "צפו בסרטון" }).focus();
    await user.keyboard(" ");
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.getByRole("button", { name: "נסו שוב" })).toHaveFocus();
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
  });
});
