import { useEffect, useRef, useState } from "react";
import { LoaderCircle, LocateFixed, MapPin, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { hasGoogleMapsApiKey, loadGooglePlaces } from "@/lib/google-maps";
import type { SelectedPlace } from "./profile-types";

type LoadState = "loading" | "ready" | "error" | "missing-key";

type Props = {
  label: string;
  hint: string;
  placeholder: string;
  values: SelectedPlace[];
  onChange: (values: SelectedPlace[]) => void;
  maxItems: number;
  radiusKm: number;
  error?: string;
};

function placeLabel(place: google.maps.places.Place, fallback: string) {
  return (
    place.displayName?.trim() || place.formattedAddress?.trim() || fallback
  );
}

export function GooglePlacesMultiSelect({
  label,
  hint,
  placeholder,
  values,
  onChange,
  maxItems,
  radiusKm,
  error,
}: Props) {
  const { i18n, t } = useTranslation();
  const language = i18n.resolvedLanguage === "he" ? "he" : "en";
  const hostRef = useRef<HTMLDivElement>(null);
  const autocompleteRef =
    useRef<google.maps.places.PlaceAutocompleteElement | null>(null);
  const valuesRef = useRef(values);
  const onChangeRef = useRef(onChange);
  const labelCacheRef = useRef(new Map<string, string>());
  const [placesLibrary, setPlacesLibrary] =
    useState<google.maps.PlacesLibrary | null>(null);
  const [loadState, setLoadState] = useState<LoadState>(() =>
    hasGoogleMapsApiKey() ? "loading" : "missing-key",
  );
  const [retryKey, setRetryKey] = useState(0);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);
  const [searchCenter, setSearchCenter] =
    useState<google.maps.LatLngLiteral | null>(null);

  useEffect(() => {
    valuesRef.current = values;
    onChangeRef.current = onChange;
  }, [onChange, values]);

  useEffect(() => {
    if (!hasGoogleMapsApiKey()) return;

    let active = true;
    void loadGooglePlaces()
      .then((library) => {
        if (!active) return;
        setPlacesLibrary(library);
        setLoadState("ready");
      })
      .catch(() => {
        if (!active) return;
        setLoadState("error");
      });
    return () => {
      active = false;
    };
  }, [retryKey]);

  useEffect(() => {
    const host = hostRef.current;
    if (!placesLibrary || !host || loadState !== "ready") return;

    const autocomplete = new placesLibrary.PlaceAutocompleteElement({
      description: hint,
      disabled: valuesRef.current.length >= maxItems,
      includedPrimaryTypes: ["(regions)"],
      includedRegionCodes: ["il"],
      maxlength: 120,
      placeholder,
      requestedLanguage: language,
      requestedRegion: "il",
    });
    autocomplete.className = "google-places-input";
    autocomplete.dir = language === "he" ? "rtl" : "ltr";
    if (searchCenter) {
      autocomplete.locationBias = {
        center: searchCenter,
        radius: Math.min(radiusKm * 1_000, 50_000),
      };
    }

    const selectPlace = async (
      event: google.maps.places.PlacePredictionSelectEvent,
    ) => {
      setSelectionError(null);
      const current = valuesRef.current;
      if (current.length >= maxItems) {
        setSelectionError(t("onboarding.listLimitReached"));
        return;
      }

      setIsSelecting(true);
      try {
        const place = event.placePrediction.toPlace();
        await place.fetchFields({
          fields: ["displayName", "formattedAddress"],
        });
        const placeId = place.id?.trim();
        if (!placeId) throw new Error("Selected place has no Place ID");
        if (current.some((item) => item.placeId === placeId)) {
          autocomplete.value = "";
          return;
        }
        const label = placeLabel(place, event.placePrediction.text.toString());
        labelCacheRef.current.set(`${language}:${placeId}`, label);
        onChangeRef.current([...current, { placeId, label }]);
        autocomplete.value = "";
      } catch {
        setSelectionError(t("onboarding.errors.placeSelection"));
      } finally {
        setIsSelecting(false);
      }
    };
    const handleGoogleError = () => {
      setSelectionError(t("onboarding.errors.placesUnavailable"));
    };
    const handleSelect = (
      event: google.maps.places.PlacePredictionSelectEvent,
    ) => {
      void selectPlace(event);
    };

    autocomplete.addEventListener("gmp-select", handleSelect);
    autocomplete.addEventListener("gmp-error", handleGoogleError);
    host.replaceChildren(autocomplete);
    autocompleteRef.current = autocomplete;

    return () => {
      autocomplete.removeEventListener("gmp-select", handleSelect);
      autocomplete.removeEventListener("gmp-error", handleGoogleError);
      autocompleteRef.current = null;
      host.replaceChildren();
    };
  }, [
    hint,
    language,
    loadState,
    maxItems,
    placeholder,
    placesLibrary,
    radiusKm,
    searchCenter,
    t,
  ]);

  useEffect(() => {
    if (!placesLibrary || loadState !== "ready" || values.length === 0) return;
    let active = true;
    const currentValues = [...values];

    void Promise.all(
      currentValues.map(async (item) => {
        const cacheKey = `${language}:${item.placeId}`;
        const cached = labelCacheRef.current.get(cacheKey);
        if (cached) return [item.placeId, cached] as const;
        try {
          const place = new placesLibrary.Place({
            id: item.placeId,
            requestedLanguage: language,
            requestedRegion: "il",
          });
          await place.fetchFields({
            fields: ["displayName", "formattedAddress"],
          });
          const label = placeLabel(
            place,
            t("onboarding.savedLocationFallback"),
          );
          labelCacheRef.current.set(cacheKey, label);
          return [item.placeId, label] as const;
        } catch {
          return [
            item.placeId,
            item.label || t("onboarding.savedLocationFallback"),
          ] as const;
        }
      }),
    ).then((resolved) => {
      if (!active) return;
      const labels = new Map(resolved);
      const latest = valuesRef.current;
      const next = latest.map((item) => ({
        ...item,
        label: labels.get(item.placeId) ?? item.label,
      }));
      if (next.some((item, index) => item.label !== latest[index]?.label)) {
        onChangeRef.current(next);
      }
    });

    return () => {
      active = false;
    };
  }, [language, loadState, placesLibrary, t, values]);

  useEffect(() => {
    const autocomplete = autocompleteRef.current;
    if (!autocomplete) return;
    autocomplete.disabled = values.length >= maxItems;
  }, [maxItems, values.length]);

  const locate = () => {
    if (!("geolocation" in navigator)) {
      setLocationStatus(t("onboarding.location.unavailable"));
      return;
    }
    setIsLocating(true);
    setLocationStatus(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setSearchCenter({ lat: coords.latitude, lng: coords.longitude });
        setLocationStatus(t("onboarding.location.ready"));
        setIsLocating(false);
      },
      (geolocationError) => {
        setLocationStatus(
          t(
            geolocationError.code === geolocationError.PERMISSION_DENIED
              ? "onboarding.location.permissionDenied"
              : "onboarding.location.failed",
          ),
        );
        setIsLocating(false);
      },
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 10_000 },
    );
  };

  const combinedError = error ?? selectionError;

  return (
    <fieldset>
      <legend className="text-sm font-medium">{label}</legend>
      <p className="text-muted-foreground mt-1.5 text-xs">{hint}</p>

      <div className="mt-2 flex items-center gap-2">
        <div
          ref={hostRef}
          className="border-input bg-background min-h-12 min-w-0 flex-1 rounded-xl"
          aria-busy={loadState === "loading" || isSelecting}
        >
          {loadState === "loading" ? (
            <div className="text-muted-foreground flex h-12 items-center gap-2 px-3 text-sm">
              <LoaderCircle
                className="size-4 animate-spin"
                aria-hidden="true"
              />
              {t("onboarding.location.loading")}
            </div>
          ) : null}
          {loadState === "error" || loadState === "missing-key" ? (
            <div className="border-destructive/40 bg-destructive/5 rounded-xl border p-3">
              <p className="text-destructive text-sm" role="alert">
                {t(
                  loadState === "missing-key"
                    ? "onboarding.errors.placesConfiguration"
                    : "onboarding.errors.placesUnavailable",
                )}
              </p>
              {loadState === "error" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => {
                    setLoadState("loading");
                    setRetryKey((value) => value + 1);
                  }}
                >
                  {t("onboarding.retry")}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-12 px-3"
          onClick={locate}
          disabled={isLocating || loadState !== "ready"}
          aria-label={t("onboarding.location.useCurrent")}
          title={t("onboarding.location.useCurrent")}
        >
          {isLocating ? (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          ) : (
            <LocateFixed aria-hidden="true" />
          )}
          <span className="hidden sm:inline">
            {t("onboarding.location.nearMe")}
          </span>
        </Button>
      </div>

      {locationStatus ? (
        <p className="text-muted-foreground mt-1.5 text-xs" aria-live="polite">
          {locationStatus}
        </p>
      ) : null}

      {values.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label={label}>
          {values.map((item) => (
            <li
              key={item.placeId}
              className="bg-primary/10 text-primary flex max-w-full items-center gap-1.5 rounded-full py-1 ps-2.5 pe-1 text-sm"
            >
              <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">
                {item.label || t("onboarding.location.loadingSaved")}
              </span>
              <button
                type="button"
                onClick={() =>
                  onChange(
                    values.filter((value) => value.placeId !== item.placeId),
                  )
                }
                className="hover:bg-primary/10 focus-visible:ring-ring/40 grid size-7 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-3"
                aria-label={t("onboarding.removeItem", {
                  item: item.label || t("onboarding.savedLocationFallback"),
                })}
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="text-muted-foreground mt-2 text-[0.6875rem]">
        {t("onboarding.location.googleAttribution")}
      </p>
      {combinedError ? (
        <p className="text-destructive mt-1 text-sm" role="alert">
          {combinedError}
        </p>
      ) : null}
    </fieldset>
  );
}
