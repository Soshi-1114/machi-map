// 国土数値情報 L01（地価公示）令和7年版から、市区町村別の住宅地平均地価を計算。
//
// 事前:
//   curl -L -o /tmp/L01_25_{prefCode}.zip https://nlftp.mlit.go.jp/ksj/gml/data/L01/L01-25/L01-25_{prefCode}_GML.zip
//   unzip -o /tmp/L01_25_{prefCode}.zip -d /tmp/L01_25_{prefCode}
//
// 実行: node scripts/fetch-land-price.mjs --pref=saitama
//       L01_GEOJSON=path/to/L01-XX_NN.geojson node scripts/fetch-land-price.mjs

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { resolvePref } from "./_lib/prefs.mjs";
import { loadMuni, saveMuni } from "./_lib/data.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const pref = resolvePref(process.argv.slice(2));
console.log(`pref: ${pref.slug} (${pref.nameJa}, code=${pref.code})`);

const L01_PATH =
  process.env.L01_GEOJSON ||
  process.argv.find((a) => a.endsWith(".geojson")) ||
  `/tmp/L01_25_${pref.code}/L01-25_${pref.code}_GML/L01-25_${pref.code}.geojson`;

if (!existsSync(L01_PATH)) {
  console.error(`L01 geojson not found: ${L01_PATH}`);
  console.error(`Download: curl -L -o /tmp/L01_25_${pref.code}.zip https://nlftp.mlit.go.jp/ksj/gml/data/L01/L01-25/L01-25_${pref.code}_GML.zip && unzip -o /tmp/L01_25_${pref.code}.zip -d /tmp/L01_25_${pref.code}`);
  process.exit(1);
}

// L02（都道府県地価調査）。地価公示(L01)が地点を持たない小町村を補完する。
// 任意: 無ければ補完スキップ。Download:
//   curl -L -o /tmp/L02_25_{code}.zip https://nlftp.mlit.go.jp/ksj/gml/data/L02/L02-25/L02-25_{code}_GML.zip
//   unzip -o /tmp/L02_25_{code}.zip -d /tmp/L02_25_{code}
const L02_PATH =
  process.env.L02_GEOJSON ||
  `/tmp/L02_25_${pref.code}/L02-25_${pref.code}.geojson`;

// 住宅地ポイントを code→価格[] でグルーピング
function groupResidential(features, { useField, codeField, priceField }) {
  const g = new Map();
  let kept = 0;
  for (const f of features) {
    const p = f.properties;
    if (!useField(p)) continue;
    const code = String(p[codeField] ?? "");
    const price = Number(p[priceField]);
    if (!code || !price) continue;
    if (!g.has(code)) g.set(code, []);
    g.get(code).push(price);
    kept++;
  }
  return { g, kept };
}

async function main() {
  const { muni, wards, paths } = await loadMuni(ROOT, pref);

  const raw = JSON.parse(await fs.readFile(L01_PATH, "utf8"));
  // L01: 住宅地 = L01_010===1, code=L01_001, 価格=L01_008
  const { g: groups, kept } = groupResidential(raw.features, {
    useField: (p) => Number(p.L01_010) === 1, codeField: "L01_001", priceField: "L01_008",
  });
  console.log(`L01 住宅地ポイント: ${kept}, カバー: ${groups.size}`);

  // L02: 住宅地 = L02_003==="000", code=L02_020, 価格=L02_006
  const groups2 = new Map();
  if (existsSync(L02_PATH)) {
    const raw2 = JSON.parse(await fs.readFile(L02_PATH, "utf8"));
    const r = groupResidential(raw2.features, {
      useField: (p) => String(p.L02_003) === "000", codeField: "L02_020", priceField: "L02_006",
    });
    for (const [k, v] of r.g) groups2.set(k, v);
    console.log(`L02 住宅地ポイント: ${r.kept}, カバー: ${groups2.size}`);
  } else {
    console.log(`L02 なし (${L02_PATH}) — 補完スキップ`);
  }

  const mean = (arr) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  // 自治体コードの住宅地価格配列を取得（政令市親は子区を合算）
  const collect = (g, code) => {
    let arr = g.get(code);
    const childWards = pref.parentToWards?.[code];
    if ((!arr || !arr.length) && childWards) arr = childWards.flatMap((c) => g.get(c) ?? []);
    return arr && arr.length ? arr : null;
  };

  const missing = [];
  let fromL01 = 0, fromL02 = 0;
  for (const list of [muni, wards]) {
    for (const m of list) {
      const a1 = collect(groups, m.code);
      if (a1) {
        m.landPrice = { value: mean(a1), unit: "円/㎡", source: "地価公示（住宅地平均）", asOf: "2025", isEstimated: false };
        fromL01++; continue;
      }
      const a2 = collect(groups2, m.code);
      if (a2) {
        m.landPrice = { value: mean(a2), unit: "円/㎡", source: "地価調査（住宅地平均）", asOf: "2025", isEstimated: false };
        fromL02++; continue;
      }
      missing.push(`${m.code} ${m.name}`);
    }
  }
  console.log(`地価セット: 公示${fromL01} + 調査${fromL02} / 無し${missing.length}`);
  if (missing.length) console.warn(`地価データ無し (${missing.length}件):`, missing.join(", "));

  await saveMuni(paths, muni, wards);
}

main().catch((e) => { console.error(e); process.exit(1); });
