"use client";

import { useTranslation } from "react-i18next";
import { MarketingVideoPlayer } from "./marketing-video-player";

export function MarketingVideo() {
  const { t } = useTranslation();
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
        <MarketingVideoPlayer />
        <p id="marketing-video-description" className="sr-only">
          {t("landing.video.description")}
        </p>
      </div>
    </section>
  );
}
