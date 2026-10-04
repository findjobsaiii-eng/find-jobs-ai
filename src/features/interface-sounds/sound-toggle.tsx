"use client";

import { useSyncExternalStore } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  getSoundEnabled,
  setSoundEnabled,
  subscribeSoundPreference,
} from "./sound-preference";

export function SoundToggle({ labeled = false }: { labeled?: boolean }) {
  const { t } = useTranslation();
  const enabled = useSyncExternalStore(
    subscribeSoundPreference,
    getSoundEnabled,
    () => true,
  );
  const label = t(
    enabled ? "interfaceSounds.disable" : "interfaceSounds.enable",
  );
  const Icon = enabled ? Volume2 : VolumeX;
  return (
    <Button
      variant="ghost"
      size={labeled ? "default" : "icon"}
      aria-label={label}
      aria-pressed={enabled}
      title={label}
      data-ui-sound="off"
      onClick={() => setSoundEnabled(!getSoundEnabled())}
      className={labeled ? "w-full justify-start font-normal" : undefined}
    >
      <Icon aria-hidden="true" className="size-4" />
      {labeled ? t("interfaceSounds.label") : null}
    </Button>
  );
}
