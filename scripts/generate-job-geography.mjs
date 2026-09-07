import { readFile, writeFile } from "node:fs/promises";

const [, , sourcePath = ".tmp-geonames-il/IL.txt"] = process.argv;
const rows = (await readFile(sourcePath, "utf8"))
  .trim()
  .split(/\r?\n/u)
  .map((line) => line.split("\t"))
  .filter(
    (columns) =>
      columns[6] === "P" &&
      !["PPLH", "PPLQ"].includes(columns[7]) &&
      (Number(columns[14]) > 0 || columns[7].startsWith("PPLA")),
  )
  .map((columns) => {
    const names = new Set([columns[1], columns[2], ...columns[3].split(",")]);
    const validAliases = [...names]
      .map((name) => name.normalize("NFKC").trim())
      .filter(
        (name) =>
          name.length >= 3 &&
          name.length <= 80 &&
          /^[\p{Script=Hebrew}\p{Script=Latin}\p{M}\p{N} .'-]+$/u.test(name),
      );
    const aliases = [
      columns[1],
      columns[2],
      ...validAliases.filter((name) => /\p{Script=Hebrew}/u.test(name)),
      ...validAliases.filter((name) => !/\p{Script=Hebrew}/u.test(name)),
    ]
      .filter((name, index, values) => name && values.indexOf(name) === index)
      .slice(0, 40);
    return [
      Number(columns[0]),
      Number(columns[4]),
      Number(columns[5]),
      Number(columns[14]),
      aliases,
    ];
  })
  .sort((left, right) => right[3] - left[3]);

const header = `// Generated from GeoNames IL.txt. Do not edit by hand.\n// Source: https://download.geonames.org/export/dump/IL.zip\n// License: Creative Commons Attribution 4.0 (https://creativecommons.org/licenses/by/4.0/)\n// Generated: 2026-09-07. Fields: [geonameId, latitude, longitude, population, aliases].\n`;
await writeFile(
  "convex/jobGeographyData.ts",
  `${header}export const ISRAEL_LOCALITIES = ${JSON.stringify(rows)} as const;\n`,
);
