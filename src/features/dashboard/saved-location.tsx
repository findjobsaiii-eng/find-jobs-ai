import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { hasGoogleMapsApiKey, loadGooglePlaces } from "@/lib/google-maps";

// Read-only labels use the same Places loader and display fields as onboarding.
export function SavedLocation({ placeId }: { placeId?: string }) {
  const { i18n, t } = useTranslation();
  const language = i18n.resolvedLanguage === "he" ? "he" : "en";
  const [resolved, setResolved] = useState<{
    id: string;
    language: string;
    label: string;
  } | null>(null);
  useEffect(() => {
    if (!placeId || !hasGoogleMapsApiKey()) return;
    let active = true;
    void loadGooglePlaces()
      .then(async (library) => {
        const place = new library.Place({
          id: placeId,
          requestedLanguage: language,
          requestedRegion: "il",
        });
        await place.fetchFields({
          fields: ["displayName", "formattedAddress"],
        });
        if (active)
          setResolved({
            id: placeId,
            language,
            label:
              place.displayName ||
              place.formattedAddress ||
              t("onboarding.savedLocationFallback"),
          });
      })
      .catch(() => {
        /* The saved Place ID remains usable when labels are unavailable. */
      });
    return () => {
      active = false;
    };
  }, [placeId, language, t]);
  return (
    <>
      {!placeId
        ? t("dashboard.anyLocation")
        : resolved?.id === placeId && resolved.language === language
          ? resolved.label
          : t("onboarding.savedLocationFallback")}
    </>
  );
}
