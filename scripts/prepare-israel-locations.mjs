import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";

const projectRoot = resolve(import.meta.dirname, "..");
const canonicalCsv = resolve(
  projectRoot,
  "data/reference/israel-localities.csv",
);
const outputPath = resolve(
  projectRoot,
  "data/generated/israel-locations.jsonl",
);
const suppliedPath = process.argv[2] ? resolve(process.argv[2]) : null;

function decodeCsv(path) {
  const bytes = readFileSync(path);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1255").decode(bytes);
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"' && quoted) {
      if (text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = false;
      }
    } else if (character === '"' && cell.trim().length === 0) {
      quoted = true;
    } else if (character === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (cell || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows;
}

const regionNamesEn = {
  11: "Jerusalem",
  21: "Safed",
  22: "Kinneret",
  23: "Afula",
  24: "Acre",
  25: "Nazareth",
  29: "Golan",
  31: "Haifa",
  32: "Hadera",
  41: "HaSharon",
  42: "Petah Tikva",
  43: "Ramla",
  44: "Rehovot",
  51: "Tel Aviv",
  52: "Ramat Gan",
  53: "Holon",
  61: "Ashkelon",
  62: "Beersheba",
  71: "Jenin",
  72: "Nablus",
  73: "Tulkarm",
  74: "Ramallah",
  75: "Jordan (Jericho)",
  76: "Bethlehem",
  77: "Hebron",
};
const regionNamesHe = {
  75: "ירדן (יריחו)",
};
const popularLocalities = new Set([
  "ירושלים",
  "תל אביב - יפו",
  "חיפה",
  "ראשון לציון",
  "פתח תקווה",
  "באר שבע",
  "נתניה",
  "אשדוד",
]);

const csvText = decodeCsv(suppliedPath ?? canonicalCsv)
  .replace(/^\uFEFF/u, "")
  .replace(/\r\n?/gu, "\n");
if (suppliedPath) {
  writeFileSync(canonicalCsv, csvText, "utf8");
}

const [headers, ...records] = parseCsv(csvText);
const expectedHeaders = [
  "סמל_ישוב",
  "שם_ישוב",
  "שם_ישוב_לועזי",
  "סמל_נפה",
  "שם_נפה",
];
if (
  !headers ||
  expectedHeaders.some((header, index) => headers[index] !== header)
) {
  throw new Error("The locality CSV does not have the expected CBS columns.");
}

const sourceVersion = `cbs-localities:${createHash("sha256")
  .update(csvText)
  .digest("hex")
  .slice(0, 12)}`;
const locations = new Map();
const regions = new Map();
for (const record of records) {
  if (record.length !== headers.length) {
    throw new Error(
      `Invalid CSV row for locality ${record[0] || "unknown"}: expected ${headers.length} columns and found ${record.length}.`,
    );
  }
  const [code, nameHe, nameEn, regionCode, regionNameHe] = record;
  if (!code || !nameHe) continue;
  locations.set(code, {
    code: `locality:${code}`,
    kind: "locality",
    nameHe,
    ...(nameEn ? { nameEn } : {}),
    searchText: [nameHe, nameEn].filter(Boolean).join(" "),
    ...(regionCode ? { parentRegionCode: `region:${regionCode}` } : {}),
    source: "Israel CBS locality list",
    sourceVersion,
    priority: popularLocalities.has(nameHe) ? 900 : 0,
    active: true,
  });
  if (regionCode && regionNameHe) {
    const normalizedRegionNameHe = regionNamesHe[regionCode] ?? regionNameHe;
    regions.set(regionCode, {
      code: `region:${regionCode}`,
      kind: "region",
      nameHe: normalizedRegionNameHe,
      ...(regionNamesEn[regionCode]
        ? { nameEn: regionNamesEn[regionCode] }
        : {}),
      searchText: [normalizedRegionNameHe, regionNamesEn[regionCode]]
        .filter(Boolean)
        .join(" "),
      source: "Israel CBS locality list",
      sourceVersion,
      priority: 500,
      active: true,
    });
  }
}

const allLocations = [
  {
    code: "nationwide:israel",
    kind: "nationwide",
    nameHe: "כל הארץ",
    nameEn: "Anywhere in Israel",
    searchText: "כל הארץ ישראל Anywhere in Israel nationwide",
    source: "application",
    sourceVersion,
    priority: 1000,
    active: true,
  },
  ...regions.values(),
  ...locations.values(),
];
if (locations.size < 1_000 || regions.size < 20) {
  throw new Error(
    `The generated dataset is unexpectedly small (${locations.size} localities, ${regions.size} regions). Import stopped.`,
  );
}
for (const location of allLocations) {
  if (
    location.nameHe.includes("\n") ||
    location.nameEn?.includes("\n") ||
    location.nameHe.length > 120 ||
    (location.nameEn?.length ?? 0) > 120
  ) {
    throw new Error(
      `Invalid generated location ${location.code}: a name contains merged rows or exceeds 120 characters.`,
    );
  }
}
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(
  outputPath,
  `${allLocations.map((location) => JSON.stringify(location)).join("\n")}\n`,
  "utf8",
);
console.log(
  `Prepared ${locations.size} localities and ${regions.size} regions in ${outputPath}`,
);
