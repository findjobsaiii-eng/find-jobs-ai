import { useEffect, useRef, useState } from "react";
import { LoaderCircle, LocateFixed, MapPin, PencilLine, X } from "lucide-react";
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
  const [isChanging, setIsChanging] = useState(false);
  const [searchCenter, setSearchCenter] =
    useState<google.maps.LatLngLiteral | null>(null);
  const selectedPlace = values[0];
  const showSearch = !selectedPlace || isChanging;

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
    if (!placesLibrary || !host || loadState !== "ready" || !showSearch) return;

    const autocomplete = new placesLibrary.PlaceAutocompleteElement({
      description: hint,
      disabled: false,
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

      setIsSelecting(true);
      try {
        const place = event.placePrediction.toPlace();
        await place.fetchFields({
          fields: ["displayName", "formattedAddress"],
        });
        const placeId = place.id?.trim();
        if (!placeId) throw new Error("Selected place has no Place ID");
        if (valuesRef.current[0]?.placeId === placeId) {
          autocomplete.value = "";
          setIsChanging(false);
          return;
        }
        const label = placeLabel(place, event.placePrediction.text.toString());
        labelCacheRef.current.set(`${language}:${placeId}`, label);
        onChangeRef.current([{ placeId, label }]);
        autocomplete.value = "";
        setIsChanging(false);
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
    const handleInput = () => {
      setSelectionError(null);
    };
    const handleBlur = () => {
      if (autocomplete.value.trim()) {
        setSelectionError(t("onboarding.errors.selectPlaceSuggestion"));
      }
    };

    autocomplete.addEventListener("gmp-select", handleSelect);
    autocomplete.addEventListener("gmp-error", handleGoogleError);
    autocomplete.addEventListener("input", handleInput);
    autocomplete.addEventListener("blur", handleBlur);
    host.replaceChildren(autocomplete);
    autocompleteRef.current = autocomplete;

    return () => {
      autocomplete.removeEventListener("gmp-select", handleSelect);
      autocomplete.removeEventListener("gmp-error", handleGoogleError);
      autocomplete.removeEventListener("input", handleInput);
      autocomplete.removeEventListener("blur", handleBlur);
      autocompleteRef.current = null;
      host.replaceChildren();
    };
  }, [
    hint,
    language,
    loadState,
    placeholder,
    placesLibrary,
    radiusKm,
    showSearch,
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

  const combinedError = selectionError ?? error;
  const selectedLabel =
    selectedPlace?.label || t("onboarding.location.loadingSaved");

  return (
    <fieldset>
      <legend className="text-sm font-medium">{label}</legend>
      <p className="text-muted-foreground mt-1.5 text-xs">{hint}</p>

      {selectedPlace ? (
        <div
          role="group"
          className="border-primary/20 bg-primary/5 mt-3 flex flex-col gap-3 rounded-2xl border p-3 sm:flex-row sm:items-center sm:justify-between"
          aria-label={t("onboarding.location.summary", {
            location: selectedLabel,
            radius: radiusKm,
          })}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded-full">
              <MapPin className="size-4" aria-hidden="true" />
            </span>
            <p className="min-w-0 truncate text-sm font-medium">
              <span>{selectedLabel}</span>
              <span className="text-muted-foreground mx-1.5" aria-hidden="true">
                ·
              </span>
              <span>
                {t("onboarding.location.radiusOption", { radius: radiusKm })}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-1 sm:shrink-0">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="flex-1 sm:flex-none"
              onClick={() => {
                setSelectionError(null);
                setIsChanging((value) => !value);
              }}
            >
              <PencilLine aria-hidden="true" />
              {t(
                isChanging
                  ? "onboarding.location.cancelChange"
                  : "onboarding.location.change",
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted-foreground flex-1 sm:flex-none"
              onClick={() => {
                onChange([]);
                setSelectionError(null);
                setIsChanging(false);
              }}
            >
              <X aria-hidden="true" />
              {t("onboarding.location.clear")}
            </Button>
          </div>
        </div>
      ) : null}

      {showSearch ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
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
            className="h-12 w-full px-3 sm:w-auto"
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
            {t("onboarding.location.nearMe")}
          </Button>
        </div>
      ) : null}

      {locationStatus ? (
        <p className="text-muted-foreground mt-1.5 text-xs" aria-live="polite">
          {locationStatus}
        </p>
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
