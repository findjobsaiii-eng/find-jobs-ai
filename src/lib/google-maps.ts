import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

let placesLibraryPromise: Promise<google.maps.PlacesLibrary> | undefined;
let loaderConfigured = false;

export function hasGoogleMapsApiKey() {
  return Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim());
}

export function loadGooglePlaces() {
  if (placesLibraryPromise) return placesLibraryPromise;

  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
  if (!key) {
    return Promise.reject(new Error("Missing VITE_GOOGLE_MAPS_API_KEY"));
  }

  if (!loaderConfigured) {
    setOptions({ key, v: "weekly", region: "IL" });
    loaderConfigured = true;
  }
  placesLibraryPromise = importLibrary("places").catch((error: unknown) => {
    placesLibraryPromise = undefined;
    throw error;
  });
  return placesLibraryPromise;
}
