import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

export type GoogleLocationBias =
  | { lat: number; lng: number }
  | { center: { lat: number; lng: number }; radius: number };

export type GooglePlace = {
  id?: string | null;
  displayName?: string | null;
  formattedAddress?: string | null;
  addressComponents?: Array<{
    longText?: string | null;
    shortText?: string | null;
    types: string[];
  }> | null;
  location?: { lat: () => number; lng: () => number } | null;
  fetchFields: (options: { fields: string[] }) => Promise<void>;
};

export type GooglePlacePredictionSelectEvent = Event & {
  placePrediction: {
    text: { toString: () => string };
    toPlace: () => GooglePlace;
  };
};

export type GooglePlaceAutocompleteElement = HTMLElement & {
  value: string;
  disabled: boolean;
  locationBias?: GoogleLocationBias | null;
};

export type GooglePlacesLibrary = {
  PlaceAutocompleteElement: new (options: {
    description: string;
    disabled: boolean;
    includedPrimaryTypes: string[];
    includedRegionCodes: string[];
    maxlength: number;
    placeholder: string;
    requestedLanguage: string;
    requestedRegion: string;
  }) => GooglePlaceAutocompleteElement;
  Place: new (options: {
    id: string;
    requestedLanguage: string;
    requestedRegion: string;
  }) => GooglePlace;
};

export type GoogleGeocoderResult = {
  place_id: string;
  formatted_address: string;
  types: string[];
  address_components: Array<{
    long_name: string;
    short_name: string;
    types: string[];
  }>;
  geometry: {
    location: { lat: () => number; lng: () => number };
  };
};

export type GoogleGeocodingLibrary = {
  Geocoder: new () => {
    geocode: (request: {
      location: { lat: number; lng: number };
      language: string;
      region: string;
    }) => Promise<{ results: GoogleGeocoderResult[] }>;
  };
};

let placesLibraryPromise: Promise<GooglePlacesLibrary> | undefined;
let geocodingLibraryPromise: Promise<GoogleGeocodingLibrary> | undefined;
let loaderConfigured = false;

function configureLoader(key: string) {
  if (loaderConfigured) return;
  setOptions({ key, v: "weekly", region: "IL" });
  loaderConfigured = true;
}

export function hasGoogleMapsApiKey() {
  return Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim());
}

export function loadGooglePlaces(): Promise<GooglePlacesLibrary> {
  if (placesLibraryPromise) return placesLibraryPromise;

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  if (!key) {
    return Promise.reject(new Error("Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"));
  }

  configureLoader(key);
  placesLibraryPromise = importLibrary("places")
    .then((library) => library as unknown as GooglePlacesLibrary)
    .catch((error: unknown) => {
      placesLibraryPromise = undefined;
      throw error;
    });
  return placesLibraryPromise;
}

export function loadGoogleGeocoding(): Promise<GoogleGeocodingLibrary> {
  if (geocodingLibraryPromise) return geocodingLibraryPromise;

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  if (!key) {
    return Promise.reject(new Error("Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"));
  }

  configureLoader(key);
  geocodingLibraryPromise = importLibrary("geocoding")
    .then((library) => library as unknown as GoogleGeocodingLibrary)
    .catch((error: unknown) => {
      geocodingLibraryPromise = undefined;
      throw error;
    });
  return geocodingLibraryPromise;
}
