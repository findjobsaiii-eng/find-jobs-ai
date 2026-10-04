"use client";

import { LoaderCircle, Play, RotateCcw } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";

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

type PlaybackStatus = "preview" | "loading" | "ready" | "ended" | "error";

export function MarketingVideo() {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<PlaybackStatus>("preview");
  const showCover =
    status === "preview" || status === "ended" || status === "error";

  function playVideo() {
    const video = videoRef.current;
    if (!video) return;

    // Set the source and play in the same user gesture for mobile Safari.
    // Keep the selected video through viewport changes during playback.
    if (!video.hasAttribute("src") || status === "error") {
      const variant = window.matchMedia("(min-width: 768px)").matches
        ? VIDEOS.desktop
        : VIDEOS.mobile;
      video.src = variant.src;
      video.poster = variant.poster;
      video.load();
    }
    if (status === "ended") video.currentTime = 0;

    // Reveal the native player before moving keyboard focus off the cover.
    flushSync(() => setStatus("loading"));
    video.focus({ preventScroll: true });
    void video.play().catch((error: unknown) => {
      setStatus(
        error instanceof DOMException && error.name === "AbortError"
          ? "ready"
          : "error",
      );
    });
  }

  const playLabel = t(
    status === "error"
      ? "landing.video.retry"
      : status === "ended"
        ? "landing.video.replay"
        : "landing.video.play",
  );

  return (
    <section
      id="watch-jobmiter"
      aria-labelledby="marketing-video-title"
      className="scroll-mt-24 px-5 pt-2 pb-16 sm:px-8 sm:pb-20"
    >
      <div className="mx-auto max-w-5xl">
        <div className="mb-7 text-center sm:mb-9">
          <p className="text-primary text-xs font-bold tracking-[0.2em] uppercase">
            {t("landing.video.eyebrow")}
          </p>
          <h2
            id="marketing-video-title"
            className="mt-3 text-3xl font-semibold tracking-[-0.045em] text-balance sm:text-4xl"
          >
            {t("landing.video.title")}
          </h2>
        </div>

        <div className="relative isolate mx-auto max-w-[21rem] md:max-w-none">
          <div
            aria-hidden="true"
            className="from-brand-teal/20 to-brand-electric/20 absolute -inset-4 -z-10 rounded-[2.5rem] bg-linear-to-br blur-2xl sm:-inset-6"
          />
          <div className="bg-brand-midnight relative aspect-[9/16] overflow-hidden rounded-3xl border border-white/15 shadow-[var(--brand-shadow-preview)] md:aspect-video">
            {showCover && (
              <picture className="absolute inset-0">
                <source
                  media="(min-width: 768px)"
                  srcSet={VIDEOS.desktop.poster}
                />
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
              aria-label={t("landing.video.playerLabel")}
              aria-describedby="marketing-video-description"
              tabIndex={showCover ? -1 : 0}
              playsInline
              preload="none"
              controls={!showCover}
              className={`absolute inset-0 size-full object-contain ${showCover ? "invisible" : "visible"}`}
              onPlaying={() => setStatus("ready")}
              onCanPlay={() => setStatus("ready")}
              onPause={() => setStatus("ready")}
              onWaiting={() => setStatus("loading")}
              onEnded={() => setStatus("ended")}
              onError={() => setStatus("error")}
            />

            {showCover && (
              <button
                type="button"
                aria-label={playLabel}
                onClick={playVideo}
                className="group from-brand-midnight/10 via-brand-midnight/10 to-brand-midnight/65 focus-visible:outline-brand-teal absolute inset-0 flex flex-col items-center justify-center gap-5 bg-linear-to-b outline-none focus-visible:outline-3 focus-visible:-outline-offset-4"
              >
                <motion.span
                  whileHover={reduceMotion ? undefined : { scale: 1.08 }}
                  whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                  className="text-brand-midnight relative grid size-20 place-items-center rounded-full bg-white shadow-xl transition-shadow group-hover:shadow-2xl motion-reduce:transition-none sm:size-24"
                >
                  <span className="border-brand-teal/50 absolute -inset-2 rounded-full border transition-transform duration-300 group-hover:scale-110 motion-reduce:transition-none" />
                  {status === "preview" ? (
                    <Play
                      aria-hidden="true"
                      className="ms-1 size-8 fill-current sm:size-9"
                    />
                  ) : (
                    <RotateCcw aria-hidden="true" className="size-8" />
                  )}
                </motion.span>
                <span className="bg-brand-midnight/80 flex items-center gap-3 rounded-full border border-white/20 px-5 py-2.5 text-sm font-semibold text-white shadow-lg backdrop-blur-md">
                  {playLabel}
                  <span aria-hidden="true" className="h-3.5 w-px bg-white/30" />
                  <span className="text-white/80">
                    {t("landing.video.duration")}
                  </span>
                </span>
              </button>
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
        </div>
        <p id="marketing-video-description" className="sr-only">
          {t("landing.video.description")}
        </p>
        {status === "error" && (
          <p role="alert" className="text-destructive mt-4 text-center text-sm">
            {t("landing.video.error")}
          </p>
        )}
      </div>
    </section>
  );
}
