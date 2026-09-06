import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");
const scriptPath = resolve(projectRoot, "scripts/prepare-israel-locations.mjs");
const outputPath = resolve(
  projectRoot,
  "data/generated/israel-locations.jsonl",
);
let locations;

beforeAll(() => {
  execFileSync(process.execPath, [scriptPath], {
    cwd: projectRoot,
    stdio: "pipe",
  });
  locations = readFileSync(outputPath, "utf8")
    .trim()
    .split("\n")
    .map((row) => JSON.parse(row));
});

describe("Israel locality import preparation", () => {
  it("keeps Hebrew quotation marks inside one CSV row", () => {
    const byCode = new Map(
      locations.map((location) => [location.code, location]),
    );

    expect(locations).toHaveLength(1_342);
    expect(byCode.get("locality:693")).toMatchObject({
      nameHe: 'נתיב הל"ה',
      nameEn: "NETIV HALAMED-HE",
    });
    expect(byCode.get("locality:1326")).toMatchObject({
      nameHe: 'בסמ"ה',
      nameEn: "BASMA",
    });
  });

  it("normalizes the reversed Jericho region parentheses", () => {
    const jericho = locations.find((location) => location.code === "region:75");
    expect(jericho).toMatchObject({
      nameHe: "ירדן (יריחו)",
      nameEn: "Jordan (Jericho)",
    });
  });

  it("never emits merged or overlong location names", () => {
    expect(
      locations.every(
        (location) =>
          !location.nameHe.includes("\n") &&
          !location.nameEn?.includes("\n") &&
          location.nameHe.length <= 120 &&
          (location.nameEn?.length ?? 0) <= 120,
      ),
    ).toBe(true);
  });
});
