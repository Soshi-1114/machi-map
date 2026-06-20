// 令和5年住宅・土地統計調査 (statsDataId 0004021470) の家賃区分別借家数を
// 取得し、bin midpoints の加重平均で平均家賃を計算、data/{pref}.json に反映。
//
// 実行: node --env-file=.env.local scripts/fetch-rent.mjs --pref=saitama

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePref, dataPaths } from "./_lib/prefs.mjs";
import { requireEstatAppId, fetchStatsValues } from "./_lib/estat.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const APP_ID = requireEstatAppId();

const pref = resolvePref(process.argv.slice(2));
console.log(`pref: ${pref.slug} (${pref.nameJa})`);

const STATS_DATA_ID = "0004021470";
const RENT_BIN_MIDPOINT = {
  "02": 5000, "03": 15000, "04": 30000, "05": 50000, "06": 70000,
  "07": 90000, "08": 125000, "09": 175000, "10": 220000,
};

// area -> (家賃区分 cat01 -> 借家数) の分布 Map。加重平均の材料。
async function fetchDistribution(codes) {
  const byArea = new Map();
  const rows = await fetchStatsValues(APP_ID, STATS_DATA_ID, codes, { cdCat02: "0" });
  for (const v of rows) {
    const area = v["@area"]; const cat = v["@cat01"];
    const n = parseInt(v["$"], 10);
    if (Number.isNaN(n)) continue;
    if (!byArea.has(area)) byArea.set(area, new Map());
    byArea.get(area).set(cat, n);
  }
  return byArea;
}

function weightedMean(distribution) {
  let weighted = 0, total = 0;
  for (const [cat, count] of distribution) {
    const mid = RENT_BIN_MIDPOINT[cat];
    if (mid == null) continue;
    weighted += mid * count;
    total += count;
  }
  return total === 0 ? null : Math.round(weighted / total);
}

async function main() {
  const paths = dataPaths(ROOT, pref);
  const muni = JSON.parse(await fs.readFile(paths.muni, "utf8"));
  const wards = paths.wards ? JSON.parse(await fs.readFile(paths.wards, "utf8")) : [];
  const allCodes = [...muni.map((m) => m.code), ...wards.map((m) => m.code)];

  console.log(`Fetching rent dist for ${allCodes.length} areas...`);
  const byArea = await fetchDistribution(allCodes);
  console.log(`Got ${byArea.size} areas with data`);

  const missing = [];
  for (const list of [muni, wards]) {
    for (const m of list) {
      const dist = byArea.get(m.code);
      const mean = dist ? weightedMean(dist) : null;
      if (mean == null) { missing.push(`${m.code} ${m.name}`); continue; }
      m.rent = {
        value: mean,
        unit: "円/月",
        source: "住宅・土地統計調査（加重平均）",
        asOf: "2023",
        isEstimated: false,
      };
    }
  }
  if (missing.length) console.warn(`Missing ${missing.length}:`, missing.join(", "));

  await fs.writeFile(paths.muni, JSON.stringify(muni, null, 2) + "\n");
  if (paths.wards) await fs.writeFile(paths.wards, JSON.stringify(wards, null, 2) + "\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
