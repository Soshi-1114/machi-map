// 国土数値情報 N03（行政区域）から、新規 pref の
//   - public/{slug}.geojson           （市区町村ポリゴン、政令市は親コードに dissolve）
//   - data/{slug}.json                （skeleton: code/pref/name + プレースホルダ指標）
//   - public/{slug}_wards.geojson      （政令市があれば: 行政区ポリゴン）
//   - data/{slug}_wards.json           （政令市があれば: 区 skeleton）
// を生成する。指標値は後段の fetch-* スクリプトが上書きする前提で、ここでは
// isEstimated:true / source:"サンプル" のプレースホルダを入れておく
// （fetch が欠落した自治体はこのサンプル値のまま残る＝既存 pref と同じ運用）。
//
// 事前:
//   curl -sL -o /tmp/N03_{code}.zip "https://nlftp.mlit.go.jp/ksj/gml/data/N03/N03-2024/N03-20240101_{code}_GML.zip"
//   unzip -o -q /tmp/N03_{code}.zip -d /tmp/N03_{code}
// 実行:
//   node --max-old-space-size=4096 scripts/build-base.mjs --pref=yamanashi

import fs from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as turf from "@turf/turf";
import { resolvePref, dataPaths } from "./_lib/prefs.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const pref = resolvePref(process.argv.slice(2));
console.log(`pref: ${pref.slug} (${pref.nameJa}, code=${pref.code}, hasWards=${pref.hasWards})`);

// --- N03 geojson 探索 ---
const N03_DIR = process.env.N03_DIR || `/tmp/N03_${pref.code}`;
if (!existsSync(N03_DIR)) {
  console.error(`N03 ディレクトリが無い: ${N03_DIR}`);
  console.error(`Download: curl -sL -o /tmp/N03_${pref.code}.zip "https://nlftp.mlit.go.jp/ksj/gml/data/N03/N03-2024/N03-20240101_${pref.code}_GML.zip" && unzip -o -q /tmp/N03_${pref.code}.zip -d /tmp/N03_${pref.code}`);
  process.exit(1);
}
const geojsonName = readdirSync(N03_DIR).find((f) => f.endsWith(".geojson"));
if (!geojsonName) { console.error(`N03 geojson が無い: ${N03_DIR}`); process.exit(1); }
const N03_PATH = path.join(N03_DIR, geojsonName);

// 簡略化トレランス（度）。約 30〜50m 相当。市区町村ポリゴンの細部を落としつつ形は保つ。
const TOLERANCE = Number(process.env.TOLERANCE || 0.0006);
const COORD_PRECISION = 6; // 小数6桁 ≒ 0.1m

function roundCoords(coords) {
  if (typeof coords[0] === "number") {
    return [Number(coords[0].toFixed(COORD_PRECISION)), Number(coords[1].toFixed(COORD_PRECISION))];
  }
  return coords.map(roundCoords);
}

// Polygon の coordinate 配列群を 1 つの MultiPolygon coordinates に束ねる
function toMultiPolygonCoords(geoms) {
  const polys = [];
  for (const g of geoms) {
    if (g.type === "Polygon") polys.push(g.coordinates);
    else if (g.type === "MultiPolygon") polys.push(...g.coordinates);
  }
  return polys;
}

function simplifyMultiPolygon(mpCoords) {
  const feat = turf.multiPolygon(mpCoords);
  let out;
  try {
    out = turf.simplify(feat, { tolerance: TOLERANCE, highQuality: false, mutate: true });
  } catch {
    out = feat; // 簡略化に失敗したら原形を使う
  }
  // simplify でリングが潰れて空になった polygon を除去
  const cleaned = out.geometry.coordinates.filter(
    (poly) => poly[0] && poly[0].length >= 4,
  );
  return roundCoords(cleaned);
}

const META = {
  rent:      { value: 0, unit: "円/月", source: "サンプル", asOf: "-", isEstimated: true },
  landPrice: { value: 0, unit: "円/㎡", source: "サンプル", asOf: "-", isEstimated: true },
  waitlistChildren: { value: 0, unit: "人", source: "サンプル", asOf: "-", isEstimated: true },
  hazard:    { hasFloodRisk: false, hasLandslideRisk: false, note: "", source: "サンプル", asOf: "-" },
  amenities: { stations: 0, preschools: 0, medicalFacilities: 0, source: "サンプル", asOf: "-" },
};

function skeleton(code, name, extra = {}) {
  return {
    code,
    pref: pref.slug,
    name,
    ...extra,
    population: 0,
    populationTrend: "横ばい",
    rent: { ...META.rent },
    landPrice: { ...META.landPrice },
    waitlistChildren: { ...META.waitlistChildren },
    hazard: { ...META.hazard },
    amenities: { ...META.amenities },
  };
}

async function main() {
  const raw = JSON.parse(await fs.readFile(N03_PATH, "utf8"));
  console.log(`N03 features: ${raw.features.length}`);

  // code -> { name, wardName, geoms[] }
  // N03_003=郡名 / N03_004=市区町村名（政令市の区では市名）/ N03_005=政令市の区名
  const byCode = new Map();
  for (const f of raw.features) {
    const p = f.properties;
    const code = String(p.N03_007 ?? "");
    if (!code || code.length !== 5) continue;       // 不正コード除外
    // 「所属未定地」(湖沼・境界未定地。コードは prefcode+"000")は自治体ではないので除外
    if (p.N03_004 === "所属未定地" || code.endsWith("000")) continue;
    const name = p.N03_004 || p.N03_003 || code;    // 通常自治体名 / 政令市なら市名
    const wardName = p.N03_005 || null;             // "葵区" など（政令市の区のみ）
    if (!byCode.has(code)) byCode.set(code, { name, wardName, geoms: [] });
    if (f.geometry) byCode.get(code).geoms.push(f.geometry);
  }
  console.log(`unique codes: ${byCode.size}`);

  // 政令市マッピング
  const parentToWards = pref.parentToWards || {};
  const wardCodes = new Set(Object.values(parentToWards).flat());
  const parentCodes = Object.keys(parentToWards);
  const parentOf = new Map();
  for (const [parent, wards] of Object.entries(parentToWards)) {
    for (const w of wards) parentOf.set(w, parent);
  }

  const muniFeatures = [];
  const wardFeatures = [];
  const muniJson = [];
  const wardsJson = [];

  // 通常市区町村（政令市の区を除く）
  for (const [code, info] of byCode) {
    if (wardCodes.has(code)) continue; // 区は後段で処理
    const mp = simplifyMultiPolygon(toMultiPolygonCoords(info.geoms));
    muniFeatures.push({ type: "Feature", properties: { name: info.name, code }, geometry: { type: "MultiPolygon", coordinates: mp } });
    muniJson.push(skeleton(code, info.name));
  }

  // 政令市: 親ポリゴン = 区ポリゴンの結合、区は wards へ
  for (const parent of parentCodes) {
    const wards = parentToWards[parent];
    const geoms = [];
    let cityName = null; // 政令市名（区の N03_004）
    for (const w of wards) {
      const info = byCode.get(w);
      if (!info) { console.warn(`  区コード ${w} が N03 に無い`); continue; }
      geoms.push(...info.geoms);
      cityName = cityName || info.name;             // "静岡市"
      const wardName = info.wardName || info.name;  // "葵区"
      const mp = simplifyMultiPolygon(toMultiPolygonCoords(info.geoms));
      wardFeatures.push({ type: "Feature", properties: { name: wardName, code: w }, geometry: { type: "MultiPolygon", coordinates: mp } });
      wardsJson.push(skeleton(w, wardName, {
        level: "ward",
        parentCode: parent,
        displayName: (info.name || "") + wardName,  // "静岡市葵区"
      }));
    }
    cityName = cityName || `${parent}`;
    const parentMp = simplifyMultiPolygon(toMultiPolygonCoords(geoms));
    muniFeatures.push({ type: "Feature", properties: { name: cityName, code: parent }, geometry: { type: "MultiPolygon", coordinates: parentMp } });
    muniJson.push(skeleton(parent, cityName));
  }

  // 並べ替え（コード順）
  muniFeatures.sort((a, b) => a.properties.code.localeCompare(b.properties.code));
  wardFeatures.sort((a, b) => a.properties.code.localeCompare(b.properties.code));
  muniJson.sort((a, b) => a.code.localeCompare(b.code));
  wardsJson.sort((a, b) => a.code.localeCompare(b.code));

  const paths = dataPaths(ROOT, pref);
  const muniGeoPath = path.join(ROOT, "public", `${pref.slug}.geojson`);
  const wardsGeoPath = path.join(ROOT, "public", `${pref.slug}_wards.geojson`);

  // geojson は 1 feature 1 行で書き出す（既存ファイルと同じ体裁、diff も見やすい）
  const writeGeo = async (p, feats) => {
    const body = feats.map((f) => "  " + JSON.stringify(f)).join(",\n");
    await fs.writeFile(p, `{"type":"FeatureCollection", "features": [\n${body}\n]}\n`);
  };

  await writeGeo(muniGeoPath, muniFeatures);
  await fs.writeFile(paths.muni, JSON.stringify(muniJson, null, 2) + "\n");
  console.log(`✓ ${path.relative(ROOT, muniGeoPath)} (${muniFeatures.length} features)`);
  console.log(`✓ ${path.relative(ROOT, paths.muni)} (${muniJson.length} muni)`);

  if (pref.hasWards) {
    await writeGeo(wardsGeoPath, wardFeatures);
    await fs.writeFile(paths.wards, JSON.stringify(wardsJson, null, 2) + "\n");
    console.log(`✓ ${path.relative(ROOT, wardsGeoPath)} (${wardFeatures.length} features)`);
    console.log(`✓ ${path.relative(ROOT, paths.wards)} (${wardsJson.length} wards)`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
