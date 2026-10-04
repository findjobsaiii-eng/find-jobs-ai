import { LoaderCircle, Play, RotateCcw } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { MarketingVideoControls } from "./marketing-video-controls";

const VIDEOS = {
  mobile: {
    src: "https://media.jobmiter.com/Jobmiter-landing-web.mp4",
    poster: "/media/jobmiter-mobile-poster.webp",
  },
  desktop: {
    src: "https://media.jobmiter.com/Jobmiter-desktop-web.mp4",
    poster: "/media/jobmiter-desktop-poster.webp",
  },
};

type PlaybackStatus =
  "preview" | "loading" | "playing" | "paused" | "ended" | "error";
type FullscreenMode = "none" | "native" | "window";

export function MarketingVideoPlayer() {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const coverRef = useRef<HTMLButtonElement>(null);
  const surfaceRef = useRef<HTMLButtonElement>(null);
  const revealOnlyOnTap = useRef(false);
  const controlsRef = useRef<HTMLDivElement>(null);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playAttempt = useRef(0);
  const lastAudibleVolume = useRef(1);
  const [status, setStatus] = useState<PlaybackStatus>("preview");
  const [audio, setAudio] = useState({ volume: 1, muted: false });
  const [progress, setProgress] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [fullscreen, setFullscreen] = useState<FullscreenMode>("none");
  const showCover =
    status === "preview" || status === "ended" || status === "error";
  const playing = status === "playing" || status === "loading";

  function revealControls() {
    setControlsVisible(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    if (
      !videoRef.current?.paused &&
      !controlsRef.current?.contains(document.activeElement)
    ) {
      hideControlsTimer.current = setTimeout(
        () => setControlsVisible(false),
        2200,
      );
    }
  }

  useEffect(() => {
    function syncFullscreen() {
      setFullscreen(
        document.fullscreenElement === frameRef.current ? "native" : "none",
      );
    }
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
      playAttempt.current += 1;
    };
  }, []);

  useEffect(() => {
    if (fullscreen !== "window") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setFullscreen("none");
      if (event.key !== "Tab") return;
      const controls = Array.from(
        frameRef.current?.querySelectorAll<HTMLElement>(
          "button:not([tabindex='-1']), input",
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [fullscreen]);

  function returnToCover(nextStatus: "ended" | "error") {
    const restoreFocus = frameRef.current?.contains(document.activeElement);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    // Save focus ownership before the focused playback control is removed.
    flushSync(() => {
      setStatus(nextStatus);
      if (nextStatus === "ended") setProgress(100);
    });
    if (restoreFocus) coverRef.current?.focus({ preventScroll: true });
  }

  function playVideo() {
    const video = videoRef.current;
    if (!video) return;
    if (!video.hasAttribute("src") || status === "error") {
      const variant = window.matchMedia("(min-width: 768px)").matches
        ? VIDEOS.desktop
        : VIDEOS.mobile;
      video.src = variant.src;
      video.poster = variant.poster;
      video.load();
      setProgress(0);
    }
    if (status === "ended") {
      video.currentTime = 0;
      setProgress(0);
    }
    const attempt = ++playAttempt.current;
    // Keep source selection and play in the activation gesture for mobile Safari.
    flushSync(() => setStatus("loading"));
    if (showCover) surfaceRef.current?.focus({ preventScroll: true });
    revealControls();
    void video.play().catch((error: unknown) => {
      if (playAttempt.current !== attempt) return;
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus("paused");
      } else {
        returnToCover("error");
      }
    });
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) playVideo();
    else {
      playAttempt.current += 1;
      video.pause();
      setStatus("paused");
      revealControls();
    }
  }

  function syncAudio() {
    const video = videoRef.current;
    if (!video) return;
    if (video.volume > 0) lastAudibleVolume.current = video.volume;
    setAudio({
      volume: video.volume,
      muted: video.muted || video.volume === 0,
    });
  }

  function setVolume(volume: number) {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = volume === 0;
    syncAudio();
  }

  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;
    if (video.muted || video.volume === 0) {
      if (video.volume === 0) video.volume = lastAudibleVolume.current;
      video.muted = false;
    } else video.muted = true;
    syncAudio();
  }

  async function toggleFullscreen() {
    const frame = frameRef.current;
    if (!frame) return;
    revealControls();
    if (fullscreen === "window") {
      setFullscreen("none");
      return;
    }
    try {
      if (document.fullscreenElement === frame) {
        await document.exitFullscreen();
        return;
      }
      if (frame.requestFullscreen) {
        await frame.requestFullscreen();
        return;
      }
    } catch {
      if (document.fullscreenElement === frame) return;
    }
    // Retain custom controls on browsers without element fullscreen (e.g. iPhone).
    setFullscreen("window");
  }

  const playLabel = t(
    status === "error"
      ? "landing.video.retry"
      : status === "ended"
        ? "landing.video.replay"
        : "landing.video.play",
  );

  return (
    <div
      className={`relative isolate mx-auto max-w-[21rem] md:max-w-none ${fullscreen === "window" ? "z-[60]" : ""}`}
    >
      <div
        aria-hidden="true"
        className="from-brand-teal/20 to-brand-electric/20 absolute -inset-4 -z-10 rounded-[2.5rem] bg-linear-to-br blur-2xl sm:-inset-6"
      />
      <div
        ref={frameRef}
        role="group"
        aria-label={t("landing.video.playerLabel")}
        aria-describedby="marketing-video-description"
        onPointerMove={revealControls}
        onPointerDown={revealControls}
        onFocusCapture={revealControls}
        onBlurCapture={revealControls}
        className="marketing-video-frame bg-brand-midnight relative aspect-[9/16] overflow-hidden rounded-3xl border border-white/15 shadow-[var(--brand-shadow-preview)] md:aspect-video"
        style={
          fullscreen === "window"
            ? {
                position: "fixed",
                inset: 0,
                width: "100%",
                height: "100svh",
                borderRadius: 0,
                aspectRatio: "auto",
              }
            : undefined
        }
      >
        {showCover && (
          <picture className="absolute inset-0">
            <source media="(min-width: 768px)" srcSet={VIDEOS.desktop.poster} />
            <Image
              src={VIDEOS.mobile.poster}
              alt=""
              width={720}
              height={1280}
              unoptimized
              className="size-full object-cover"
            />
          </picture>
        )}
        {/* The supplied films include burned-in Hebrew captions. */}
        <video
          ref={videoRef}
          playsInline
          preload="none"
          disablePictureInPicture
          disableRemotePlayback
          className={`absolute inset-0 size-full object-contain ${showCover ? "invisible" : "visible"}`}
          onPlaying={() => {
            setStatus("playing");
            revealControls();
          }}
          onCanPlay={(event) =>
            setStatus(event.currentTarget.paused ? "paused" : "playing")
          }
          onPause={() => {
            setStatus("paused");
            revealControls();
          }}
          onWaiting={() => setStatus("loading")}
          onEnded={() => returnToCover("ended")}
          onError={() => returnToCover("error")}
          onVolumeChange={syncAudio}
          onTimeUpdate={(event) => {
            const video = event.currentTarget;
            if (Number.isFinite(video.duration) && video.duration > 0)
              setProgress(
                Math.min(
                  100,
                  Math.max(0, (video.currentTime / video.duration) * 100),
                ),
              );
          }}
        />
        {showCover ? (
          <motion.button
            ref={coverRef}
            type="button"
            aria-label={playLabel}
            onClick={playVideo}
            whileTap={reduceMotion ? undefined : { scale: 0.99 }}
            className="group from-brand-midnight/10 via-brand-midnight/10 to-brand-midnight/65 focus-visible:outline-brand-teal absolute inset-0 flex flex-col items-center justify-center gap-5 bg-linear-to-b outline-none focus-visible:outline-3 focus-visible:-outline-offset-4"
          >
            <span className="text-brand-midnight relative grid size-20 place-items-center rounded-full bg-white shadow-xl transition-[transform,box-shadow] duration-200 group-hover:scale-105 group-hover:shadow-2xl motion-reduce:transition-none sm:size-24">
              <span className="border-brand-teal/50 absolute -inset-2 rounded-full border transition-transform duration-300 group-hover:scale-110 motion-reduce:transition-none" />
              {status === "preview" ? (
                <Play
                  aria-hidden="true"
                  className="ms-1 size-8 fill-current sm:size-9"
                />
              ) : (
                <RotateCcw aria-hidden="true" className="size-8" />
              )}
            </span>
            <span className="bg-brand-midnight/80 flex items-center gap-3 rounded-full border border-white/20 px-5 py-2.5 text-sm font-semibold text-white shadow-lg backdrop-blur-md">
              {playLabel}
              <span aria-hidden="true" className="h-3.5 w-px bg-white/30" />
              <span className="text-white/80">
                {t("landing.video.duration")}
              </span>
            </span>
          </motion.button>
        ) : (
          <>
            <button
              ref={surfaceRef}
              type="button"
              tabIndex={-1}
              aria-label={t(
                playing ? "landing.video.pause" : "landing.video.resume",
              )}
              onPointerDown={(event) => {
                revealOnlyOnTap.current =
                  event.pointerType === "touch" && playing && !controlsVisible;
              }}
              onClick={() => {
                if (revealOnlyOnTap.current) revealControls();
                else togglePlay();
                revealOnlyOnTap.current = false;
              }}
              className="absolute inset-0 grid place-items-center outline-none focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white/80"
            >
              {status === "paused" && (
                <span className="bg-brand-midnight/70 grid size-16 place-items-center rounded-full border border-white/20 text-white backdrop-blur-xl">
                  <Play
                    aria-hidden="true"
                    className="ms-1 size-6 fill-current"
                  />
                </span>
              )}
            </button>
            <MarketingVideoControls
              controlsRef={controlsRef}
              visible={status !== "playing" || controlsVisible}
              playing={playing}
              fullscreen={fullscreen !== "none"}
              volume={audio.volume}
              muted={audio.muted}
              progress={progress}
              onTogglePlay={togglePlay}
              onToggleMute={toggleMute}
              onVolumeChange={setVolume}
              onToggleFullscreen={() => void toggleFullscreen()}
            />
          </>
        )}
        {status === "loading" && (
          <div
            role="status"
            className="bg-brand-midnight/25 pointer-events-none absolute inset-0 grid place-items-center"
          >
            <span className="bg-brand-midnight/80 grid size-16 place-items-center rounded-full border border-white/20 text-white backdrop-blur-md">
              <LoaderCircle
                aria-hidden="true"
                className="size-7 animate-spin motion-reduce:animate-none"
              />
            </span>
            <span className="sr-only">{t("landing.video.loading")}</span>
          </div>
        )}
      </div>
      {status === "error" && (
        <p role="alert" className="text-destructive mt-4 text-center text-sm">
          {t("landing.video.error")}
        </p>
      )}
    </div>
  );
}
