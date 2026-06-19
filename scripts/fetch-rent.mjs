// 令和5年住宅・土地統計調査 (statsDataId 0004021470) の家賃区分別借家数を
// 取得し、bin midpoints の加重平均で平均家賃を計算、data/{pref}.json に反映。
//
// 実行: node --env-file=.env.local scripts/fetch-rent.mjs --pref=saitama

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePref, dataPaths } from "./_lib/prefs.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const APP_ID = process.env.ESTAT_APP_ID;
if (!APP_ID) { console.error("ESTAT_APP_ID が未設定"); process.exit(1); }

const pref = resolvePref(process.argv.slice(2));
console.log(`pref: ${pref.slug} (${pref.nameJa})`);

const STATS_DATA_ID = "0004021470";
const RENT_BIN_MIDPOINT = {
  "02": 5000, "03": 15000, "04": 30000, "05": 50000, "06": 70000,
  "07": 90000, "08": 125000, "09": 175000, "10": 220000,
};

async function fetchDistribution(codes) {
  const url = new URL("https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData");
  url.searchParams.set("appId", APP_ID);
  url.searchParams.set("statsDataId", STATS_DATA_ID);
  url.searchParams.set("cdArea", codes.join(","));
  url.searchParams.set("cdCat02", "0");
  url.searchParams.set("limit", "100000");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const values = data.GET_STATS_DATA?.STATISTICAL_DATA?.DATA_INF?.VALUE ?? [];
  const arr = Array.isArray(values) ? values : [values];
  const byArea = new Map();
  for (const v of arr) {
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
