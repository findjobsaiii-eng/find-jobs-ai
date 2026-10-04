import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

describe("landing marketing video", () => {
  beforeAll(async () => {
    await initializeI18n();
  });

  beforeEach(async () => {
    await i18n.changeLanguage("en");
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function getVideo(container: HTMLElement) {
    return container.querySelector("video")!;
  }

  it("shows the play invitation without downloading or autoplaying a video", () => {
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
      vi.mocked(window.matchMedia).mockReturnValue({
        ...window.matchMedia("(min-width: 768px)"),
        matches: desktop,
      });
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
      expect(video).toHaveAttribute("controls");
      expect(video).toHaveFocus();
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("status")).toHaveTextContent("Loading video");

      fireEvent.playing(video);
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Watch the film" }),
      ).not.toBeInTheDocument();
    },
  );

  it("recovers from a rejected play request and a subsequent network error", async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(
      new Error("Playback failed"),
    );
    const user = userEvent.setup();
    const { container } = render(<MarketingVideo />);
    const video = getVideo(container);
    await user.click(screen.getByRole("button", { name: "Watch the film" }));

    expect(await screen.findByRole("alert")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    fireEvent.playing(video);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalledTimes(2);

    fireEvent.error(video);
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
    expect(screen.getByRole("alert")).toBeVisible();
  });

  it("keeps native pause controls and replays the selected video after it ends", async () => {
    const user = userEvent.setup();
    const { container } = render(<MarketingVideo />);
    const video = getVideo(container);
    await user.click(screen.getByRole("button", { name: "Watch the film" }));
    fireEvent.playing(video);
    const selectedSource = video.src;

    fireEvent.waiting(video);
    expect(screen.getByRole("status")).toBeInTheDocument();
    fireEvent.pause(video);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(video).toHaveAttribute("controls");

    video.currentTime = 32;
    fireEvent.ended(video);
    await user.click(screen.getByRole("button", { name: "Watch again" }));
    expect(video.currentTime).toBe(0);
    expect(video.src).toBe(selectedSource);
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalledTimes(1);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
  });

  it("offers the same keyboard playback and localized recovery in Hebrew", async () => {
    await i18n.changeLanguage("he");
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(
      new Error("Offline"),
    );
    const user = userEvent.setup();
    render(<MarketingVideo />);
    screen.getByRole("button", { name: "צפו בסרטון" }).focus();
    await user.keyboard(" ");

    await waitFor(() => expect(screen.getByRole("alert")).toBeVisible());
    expect(screen.getByRole("button", { name: "נסו שוב" })).toBeVisible();
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
  });
});
