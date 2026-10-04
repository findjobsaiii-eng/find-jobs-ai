"use client";

import { useEffect, type ReactNode } from "react";
import { createUISFX, type CueName } from "uisfx";
import { interactionCue } from "./interaction-cue";
import { getSoundEnabled, subscribeSoundPreference } from "./sound-preference";

export function InterfaceSoundsProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const player = createUISFX({
      pack: "minimal",
      volume: 0.35,
      maxVoices: 2,
      cooldownMs: 85,
      enabled: getSoundEnabled(),
    });
    let disposed = false;
    let lastInteraction = -Infinity;
    const unsubscribe = subscribeSoundPreference(() => {
      player.setEnabled(getSoundEnabled());
    });
    const playCue = (event: Event, cue: CueName, cooldownMs = 85) => {
      if (!event.isTrusted || !getSoundEnabled() || document.hidden) return;
      if (
        [...document.querySelectorAll("video, audio")].some(
          (media) =>
            media instanceof HTMLMediaElement && !media.paused && !media.muted,
        )
      )
        return;
      const now = performance.now();
      if (now - lastInteraction < cooldownMs) return;
      lastInteraction = now;
      // Resume within the trusted gesture; do not replay a queued cue after mute.
      void player
        .unlock()
        .then((unlocked) => {
          if (unlocked && !disposed && getSoundEnabled()) player.play(cue);
        })
        .catch(() => {
          // Unsupported or blocked audio must never interrupt the interaction.
        });
    };
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)
        return;
      const cue = interactionCue(event.target);
      if (cue) playCue(event, cue);
    };
    const onInput = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.type !== "range")
        return;
      if (
        target.closest(
          '[disabled], [aria-disabled="true"], [inert], [data-ui-sound="off"], .marketing-video-frame',
        )
      )
        return;
      // Input fires for actual value changes, including touch and arrow keys.
      playCue(event, "snap", 120);
    };
    const onVisibility = () => {
      if (document.hidden) player.stopAll();
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("input", onInput, true);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      unsubscribe();
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("visibilitychange", onVisibility);
      void player.destroy().catch(() => {});
    };
  }, []);

  return children;
}
