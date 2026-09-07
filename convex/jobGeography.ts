import { ISRAEL_LOCALITIES } from "./jobGeographyData";

export type JobGeography = {
  placeId: string;
  countryCode: "IL";
  latitude: number;
  longitude: number;
  precision: "locality_centroid";
};

function normalize(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[’‘`]/gu, "'")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

const israelNames = new Set([
  "il",
  "israel",
  "israel il",
  "il israel",
  "state of israel",
  "ישראל",
]);

type Locality = (typeof ISRAEL_LOCALITIES)[number];
const aliases = new Map<string, Locality[]>();
for (const locality of ISRAEL_LOCALITIES) {
  for (const rawAlias of locality[4]) {
    const alias = normalize(rawAlias);
    if (alias.length < 3) continue;
    const current = aliases.get(alias) ?? [];
    if (!current.some((candidate) => candidate[0] === locality[0])) {
      current.push(locality);
      aliases.set(alias, current);
    }
  }
}

function result(locality: Locality): JobGeography {
  return {
    placeId: `geonames:${locality[0]}`,
    countryCode: "IL",
    latitude: locality[1],
    longitude: locality[2],
    precision: "locality_centroid",
  };
}

function selectedLocality(alias: string) {
  const candidates = aliases.get(alias) ?? [];
  const [match, runnerUp] = candidates;
  if (runnerUp && (match[3] < 10_000 || match[3] < runnerUp[3] * 2)) {
    return undefined;
  }
  return match;
}

function exactLocality(value: string) {
  const match = selectedLocality(normalize(value));
  return match ? result(match) : undefined;
}

function localityInText(value: string) {
  const text = ` ${normalize(value)} `;
  const matches = new Map<number, Locality>();
  for (const [alias] of aliases) {
    const locality = selectedLocality(alias);
    if (locality && alias.length >= 4 && text.includes(` ${alias} `)) {
      matches.set(locality[0], locality);
    }
  }
  return matches.size === 1 ? result([...matches.values()][0]) : undefined;
}

export function resolveJobGeography(job: {
  city: string | null;
  locationText: string | null;
  country: string | null;
}): JobGeography | undefined {
  const country = normalize(job.country ?? "");
  if (country && !israelNames.has(country)) return undefined;
  if (job.city) return exactLocality(job.city);
  return job.locationText ? localityInText(job.locationText) : undefined;
}

export function distanceKm(
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number },
) {
  const radians = Math.PI / 180;
  const latitude = (right.latitude - left.latitude) * radians;
  const longitude = (right.longitude - left.longitude) * radians;
  const haversine =
    Math.sin(latitude / 2) ** 2 +
    Math.cos(left.latitude * radians) *
      Math.cos(right.latitude * radians) *
      Math.sin(longitude / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, haversine)));
}
