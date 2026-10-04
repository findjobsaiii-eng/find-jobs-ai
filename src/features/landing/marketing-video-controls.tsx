import {
  Maximize,
  Minimize,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

type VideoControlsProps = {
  controlsRef: RefObject<HTMLDivElement | null>;
  visible: boolean;
  playing: boolean;
  fullscreen: boolean;
  volume: number;
  muted: boolean;
  progress: number;
  onTogglePlay: () => void;
  onToggleMute: () => void;
  onVolumeChange: (volume: number) => void;
  onToggleFullscreen: () => void;
};

const CONTROL_CLASS =
  "size-11 rounded-full text-white hover:bg-white/15 hover:text-white focus-visible:border-white/60 focus-visible:ring-white/60";

export function MarketingVideoControls({
  controlsRef,
  visible,
  playing,
  fullscreen,
  volume,
  muted,
  progress,
  onTogglePlay,
  onToggleMute,
  onVolumeChange,
  onToggleFullscreen,
}: VideoControlsProps) {
  const { t } = useTranslation();
  const playLabel = t(playing ? "landing.video.pause" : "landing.video.resume");
  const muteLabel = t(muted ? "landing.video.unmute" : "landing.video.mute");
  const fullscreenLabel = t(
    fullscreen ? "landing.video.exitFullscreen" : "landing.video.fullscreen",
  );
  const islandClass = `bg-brand-midnight/45 flex items-center rounded-2xl border border-white/20 p-1 shadow-lg backdrop-blur-xl focus-within:pointer-events-auto ${visible ? "pointer-events-auto" : "pointer-events-none"}`;
  return (
    <>
      <div
        ref={controlsRef}
        role="toolbar"
        aria-label={t("landing.video.controls")}
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center justify-between gap-3 px-3 pb-3 transition-opacity duration-200 focus-within:opacity-100 motion-reduce:transition-none sm:px-5 sm:pb-4 ${visible ? "opacity-100" : "opacity-0"}`}
      >
        <div className={islandClass}>
          <Button
            variant="ghost"
            size="icon"
            type="button"
            aria-label={playLabel}
            title={playLabel}
            onClick={onTogglePlay}
            className={CONTROL_CLASS}
          >
            {playing ? (
              <Pause aria-hidden="true" className="size-5 fill-current" />
            ) : (
              <Play aria-hidden="true" className="size-5 fill-current" />
            )}
          </Button>
        </div>
        <div className={`${islandClass} gap-1 sm:gap-2`} dir="ltr">
          <Button
            variant="ghost"
            size="icon"
            type="button"
            aria-label={muteLabel}
            title={muteLabel}
            onClick={onToggleMute}
            className={CONTROL_CLASS}
          >
            {muted ? (
              <VolumeX aria-hidden="true" className="size-5" />
            ) : (
              <Volume2 aria-hidden="true" className="size-5" />
            )}
          </Button>
          <input
            type="range"
            aria-label={t("landing.video.volume")}
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(event) => onVolumeChange(Number(event.target.value))}
            className="accent-brand-teal me-2 hidden h-11 w-20 cursor-pointer rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:block"
            dir="ltr"
          />
          <Button
            variant="ghost"
            size="icon"
            type="button"
            aria-label={fullscreenLabel}
            title={fullscreenLabel}
            onClick={onToggleFullscreen}
            className={CONTROL_CLASS}
          >
            {fullscreen ? (
              <Minimize aria-hidden="true" className="size-5" />
            ) : (
              <Maximize aria-hidden="true" className="size-5" />
            )}
          </Button>
        </div>
      </div>
      <div
        role="progressbar"
        aria-label={t("landing.video.progress")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-0.5 overflow-hidden bg-white/20"
        dir="ltr"
      >
        <div
          className="bg-brand-teal h-full w-full origin-left transition-transform duration-300 ease-linear motion-reduce:transition-none"
          style={{ transform: `scaleX(${progress / 100})` }}
        />
      </div>
    </>
  );
}
