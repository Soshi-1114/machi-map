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
import { resolvePref, dataPaths } from "./_lib/prefs.mjs";

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

async function main() {
  const paths = dataPaths(ROOT, pref);
  const muni = JSON.parse(await fs.readFile(paths.muni, "utf8"));
  const wards = paths.wards ? JSON.parse(await fs.readFile(paths.wards, "utf8")) : [];

  const raw = JSON.parse(await fs.readFile(L01_PATH, "utf8"));
  console.log(`L01 features: ${raw.features.length}`);

  const groups = new Map();
  let kept = 0;
  for (const f of raw.features) {
    const p = f.properties;
    if (Number(p.L01_010) !== 1) continue; // 住宅地のみ
    const code = String(p.L01_001 ?? "");
    const price = Number(p.L01_008);
    if (!code || !price) continue;
    if (!groups.has(code)) groups.set(code, []);
    groups.get(code).push(price);
    kept++;
  }
  console.log(`住宅地ポイント数: ${kept}, カバー: ${groups.size}`);

  const mean = (arr) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);

  const missing = [];
  for (const list of [muni, wards]) {
    for (const m of list) {
      let arr = groups.get(m.code);
      // 政令市親は子区を合算
      const childWards = pref.parentToWards?.[m.code];
      if ((!arr || arr.length === 0) && childWards) {
        arr = childWards.flatMap((c) => groups.get(c) ?? []);
      }
      if (!arr || arr.length === 0) { missing.push(`${m.code} ${m.name}`); continue; }
      m.landPrice = {
        value: mean(arr), unit: "円/㎡",
        source: "地価公示（住宅地平均）", asOf: "2025", isEstimated: false,
      };
    }
  }
  if (missing.length) console.warn(`地価データ無し (${missing.length}件):`, missing.join(", "));

  await fs.writeFile(paths.muni, JSON.stringify(muni, null, 2) + "\n");
  if (paths.wards) await fs.writeFile(paths.wards, JSON.stringify(wards, null, 2) + "\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
