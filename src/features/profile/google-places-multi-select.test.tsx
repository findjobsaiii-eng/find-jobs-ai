import { useState } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import i18n, { initializeI18n } from "@/i18n";
import type {
  GoogleLocationBias,
  GooglePlaceAutocompleteElement,
} from "@/lib/google-maps";
import { GooglePlacesMultiSelect } from "./google-places-multi-select";
import type { SelectedPlace } from "./profile-types";

const places = vi.hoisted(() => ({
  autocomplete: null as GooglePlaceAutocompleteElement | null,
}));

vi.mock("@/lib/google-maps", () => {
  class FakeAutocomplete extends HTMLElement {
    value = "";
    disabled = false;
    locationBias?: GoogleLocationBias;

    constructor() {
      super();
      places.autocomplete = this as unknown as GooglePlaceAutocompleteElement;
    }
  }

  if (!customElements.get("fake-place-autocomplete")) {
    customElements.define("fake-place-autocomplete", FakeAutocomplete);
  }

  return {
    hasGoogleMapsApiKey: () => true,
    loadGooglePlaces: async () => ({
      PlaceAutocompleteElement: FakeAutocomplete,
      Place: class {},
    }),
  };
});

function LocationHarness() {
  const [values, setValues] = useState<SelectedPlace[]>([]);
  return (
    <GooglePlacesMultiSelect
      label="Job-search location"
      hint="Choose one location"
      placeholder="Search"
      values={values}
      onChange={setValues}
      radiusKm={25}
    />
  );
}

function selectPlace(placeId: string, label: string) {
  const event = new Event("gmp-select");
  Object.defineProperty(event, "placePrediction", {
    value: {
      text: { toString: () => label },
      toPlace: () => ({
        id: placeId,
        displayName: label,
        formattedAddress: `${label}, Israel`,
        addressComponents: [
          { longText: label, shortText: label, types: ["locality"] },
          {
            longText: "Tel Aviv District",
            shortText: "TA",
            types: ["administrative_area_level_1"],
          },
          { longText: "Israel", shortText: "IL", types: ["country"] },
        ],
        location: { lat: () => 32.0853, lng: () => 34.7818 },
        fetchFields: vi.fn().mockResolvedValue(undefined),
      }),
    },
  });
  places.autocomplete?.dispatchEvent(event);
}

describe("single Google Places location", () => {
  beforeAll(async () => {
    await initializeI18n();
  });

  beforeEach(async () => {
    places.autocomplete = null;
    await i18n.changeLanguage("en");
  });

  it("requires a suggestion, then supports replacing and clearing one location", async () => {
    const user = userEvent.setup();
    render(<LocationHarness />);
    expect(document.documentElement).toHaveAttribute("dir", "ltr");

    await waitFor(() => expect(places.autocomplete).not.toBeNull());
    if (!places.autocomplete) throw new Error("Autocomplete did not load");

    places.autocomplete.value = "Rishon";
    places.autocomplete.dispatchEvent(new Event("input"));
    places.autocomplete.dispatchEvent(new Event("blur"));
    expect(
      await screen.findByText(
        "Choose a Google suggestion to confirm this location.",
      ),
    ).toBeVisible();

    await act(async () => selectPlace("place-rishon", "Rishon LeZion"));
    expect(await screen.findByLabelText("Rishon LeZion · 25 km")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Change location" }));
    await waitFor(() => expect(places.autocomplete).not.toBeNull());
    await act(async () => selectPlace("place-haifa", "Haifa"));
    expect(await screen.findByLabelText("Haifa · 25 km")).toBeVisible();
    expect(screen.queryByText("Rishon LeZion")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear location" }));
    expect(screen.queryByLabelText("Haifa · 25 km")).not.toBeInTheDocument();
    await waitFor(() => expect(places.autocomplete).not.toBeNull());
  });
});
