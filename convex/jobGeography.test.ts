import { describe, expect, it } from "vitest";
import { distanceKm, resolveJobGeography } from "./jobGeography";

describe("job geography", () => {
  it.each(["Tel Aviv", "Tel Aviv-Yafo", "תל אביב - יפו", "תל אביב"])(
    "resolves Tel Aviv alias %s",
    (city) => {
      const location = resolveJobGeography({
        city,
        country: "Israel",
        locationText: city,
      });
      expect(location).toMatchObject({
        countryCode: "IL",
        placeId: "geonames:293397",
      });
      expect(location?.latitude).toBeCloseTo(32.08088, 3);
    },
  );

  it("resolves an unambiguous city embedded in location text", () => {
    expect(
      resolveJobGeography({
        city: null,
        country: "IL",
        locationText: "Ramat Gan, Israel",
      }),
    ).toMatchObject({ placeId: "geonames:293788" });
  });

  it("does not invent coordinates for unknown, ambiguous, or foreign locations", () => {
    expect(
      resolveJobGeography({
        city: "Israel",
        country: "Israel",
        locationText: null,
      }),
    ).toBeUndefined();
    expect(
      resolveJobGeography({
        city: null,
        country: null,
        locationText: "Several locations",
      }),
    ).toBeUndefined();
    expect(
      resolveJobGeography({
        city: "Tel Aviv",
        country: "Germany",
        locationText: null,
      }),
    ).toBeUndefined();
  });

  it("calculates radius distance without AI", () => {
    const telAviv = resolveJobGeography({
      city: "Tel Aviv",
      country: "IL",
      locationText: null,
    });
    const ramatGan = resolveJobGeography({
      city: "Ramat Gan",
      country: "IL",
      locationText: null,
    });
    expect(distanceKm(telAviv!, ramatGan!)).toBeGreaterThan(2);
    expect(distanceKm(telAviv!, ramatGan!)).toBeLessThan(10);
  });
});
