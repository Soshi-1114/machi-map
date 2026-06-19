// 令和2年国勢調査 人口等基本集計から、指定都道府県の市区町村+区の総人口を取得し
// data/{pref}.json / {pref}_wards.json の population を上書き。
//
// 実行: node --env-file=.env.local scripts/fetch-population.mjs --pref=saitama

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

const STATS_DATA_ID = "0003445078"; // 令和2年国勢調査 人口等基本集計

async function loadCodes() {
  const paths = dataPaths(ROOT, pref);
  const muni = JSON.parse(await fs.readFile(paths.muni, "utf8"));
  const wards = paths.wards
    ? JSON.parse(await fs.readFile(paths.wards, "utf8"))
    : [];
  return { muni, wards, paths, allCodes: [...muni.map((m) => m.code), ...wards.map((m) => m.code)] };
}

async function fetchPopulationByArea(codes) {
  const url = new URL("https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData");
  url.searchParams.set("appId", APP_ID);
  url.searchParams.set("statsDataId", STATS_DATA_ID);
  url.searchParams.set("cdArea", codes.join(","));
  url.searchParams.set("cdCat01", "0");
  url.searchParams.set("limit", "100000");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const values = data.GET_STATS_DATA?.STATISTICAL_DATA?.DATA_INF?.VALUE ?? [];
  const arr = Array.isArray(values) ? values : [values];
  const byCode = new Map();
  for (const v of arr) {
    const code = v["@area"];
    const val = parseInt(v["$"], 10);
    if (!Number.isNaN(val)) byCode.set(code, val);
  }
  return byCode;
}

async function main() {
  const { muni, wards, paths, allCodes } = await loadCodes();
  console.log(`Fetching population for ${allCodes.length} areas...`);
  const byCode = await fetchPopulationByArea(allCodes);
  console.log(`Got ${byCode.size} results`);

  const missing = [];
  for (const list of [muni, wards]) {
    for (const m of list) {
      const v = byCode.get(m.code);
      if (v == null) { missing.push(`${m.code} ${m.name}`); continue; }
      m.population = v;
    }
  }
  if (missing.length) console.warn("Missing:", missing.join(", "));

  await fs.writeFile(paths.muni, JSON.stringify(muni, null, 2) + "\n");
  if (paths.wards) await fs.writeFile(paths.wards, JSON.stringify(wards, null, 2) + "\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
