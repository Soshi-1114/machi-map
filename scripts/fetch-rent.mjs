// 平成30年住宅・土地統計調査から、市区町村別の平均家賃を取得し
// data/saitama.json / saitama_wards.json の rent.value を上書きする。
//
// 実行: node --env-file=.env.local scripts/fetch-rent.mjs

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const APP_ID = process.env.ESTAT_APP_ID;
if (!APP_ID) {
  console.error("ESTAT_APP_ID が未設定");
  process.exit(1);
}

const STATS_DATA_ID = "0003356444"; // 住宅の1か月当たり家賃 - 居住室の畳数(6区分)別 - 借家
// 軸:
//   cat01 = 0  (居住室畳数 総数)
//   cat02 = 2  (家賃0円含まない)

async function loadJson(rel) {
  return JSON.parse(await fs.readFile(path.join(ROOT, rel), "utf8"));
}

async function fetchRent(codes) {
  const url = new URL("https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData");
  url.searchParams.set("appId", APP_ID);
  url.searchParams.set("statsDataId", STATS_DATA_ID);
  url.searchParams.set("cdArea", codes.join(","));
  url.searchParams.set("cdCat01", "0");
  url.searchParams.set("cdCat02", "2");
  url.searchParams.set("limit", "100000");

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const values = data.GET_STATS_DATA?.STATISTICAL_DATA?.DATA_INF?.VALUE ?? [];
  const arr = Array.isArray(values) ? values : [values];
  const byCode = new Map();
  for (const v of arr) {
    const code = v["@area"];
    // 値は数値文字列、特殊記号("-" や "...") は数値変換失敗する
    const raw = v["$"];
    const num = parseFloat(raw);
    if (!Number.isNaN(num) && num > 0) byCode.set(code, Math.round(num));
  }
  return byCode;
}

async function main() {
  const muni = await loadJson("data/saitama.json");
  const wards = await loadJson("data/saitama_wards.json");
  const allCodes = [...muni.map((m) => m.code), ...wards.map((m) => m.code)];

  console.log(`Fetching rent for ${allCodes.length} areas...`);
  const byCode = await fetchRent(allCodes);
  console.log(`Got ${byCode.size} results`);

  const missing = [];
  function update(list) {
    for (const m of list) {
      const v = byCode.get(m.code);
      if (v == null) {
        missing.push(`${m.code} ${m.name}`);
        continue;
      }
      m.rent = {
        value: v,
        unit: "円/月",
        source: "住宅・土地統計調査",
        asOf: "2018",
        isEstimated: false,
      };
    }
  }
  update(muni);
  update(wards);

  if (missing.length) {
    console.warn(`\nMissing rent data for ${missing.length} areas (likely sample-size limitation):`);
    console.warn(missing.join(", "));
    console.warn("→ これらは既存の推計値のまま残します");
  }

  await fs.writeFile(
    path.join(ROOT, "data/saitama.json"),
    JSON.stringify(muni, null, 2) + "\n",
  );
  await fs.writeFile(
    path.join(ROOT, "data/saitama_wards.json"),
    JSON.stringify(wards, null, 2) + "\n",
  );

  console.log("\n--- sample ---");
  for (const code of ["11100", "11107", "11203", "11369"]) {
    const v = byCode.get(code);
    const all = [...muni, ...wards];
    const m = all.find((x) => x.code === code);
    console.log(`${code} ${m?.name ?? "?"}: ${v?.toLocaleString() ?? "n/a"} 円/月`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
