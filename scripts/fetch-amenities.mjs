// reinfolib XKT015 (駅)、XKT007 (保育園・幼稚園等)、XKT010 (医療機関) のポイントを
// 取得し、各市区町村ポリゴン内に含まれる数をカウントして amenities フィールドに反映。
//
// 実行: node --env-file=.env.local --max-old-space-size=4096 scripts/fetch-amenities.mjs --pref=saitama

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync } from "node:fs";
import * as turf from "@turf/turf";
import { resolvePref, dataPaths } from "./_lib/prefs.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const pref = resolvePref(process.argv.slice(2));
console.log(`pref: ${pref.slug} (${pref.nameJa})`);

const CACHE_DIR = path.join(ROOT, `.cache/reinfolib-tiles/${pref.slug}`);
mkdirSync(CACHE_DIR, { recursive: true });

const KEY = process.env.REINFOLIB_API_KEY;
if (!KEY) { console.error("REINFOLIB_API_KEY が未設定"); process.exit(1); }

const BASE = "https://www.reinfolib.mlit.go.jp/ex-api/external";
const ZOOM = 13;
const FETCH_CONCURRENCY = 4;

function lng2tileX(lng, z) { return Math.floor(((lng + 180) / 360) * Math.pow(2, z)); }
function lat2tileY(lat, z) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * Math.pow(2, z));
}
function tilesForBbox(bbox, z) {
  const xMin = lng2tileX(bbox.west, z), xMax = lng2tileX(bbox.east, z);
  const yMin = lat2tileY(bbox.north, z), yMax = lat2tileY(bbox.south, z);
  const list = [];
  for (let x = xMin; x <= xMax; x++) for (let y = yMin; y <= yMax; y++) list.push({ x, y });
  return list;
}

async function ensureTile(api, x, y, z) {
  const cachePath = path.join(CACHE_DIR, `${api}_z${z}_x${x}_y${y}.json`);
  if (existsSync(cachePath)) return cachePath;
  const url = new URL(`${BASE}/${api}`);
  url.searchParams.set("response_format", "geojson");
  url.searchParams.set("z", z); url.searchParams.set("x", x); url.searchParams.set("y", y);
  const res = await fetch(url, { headers: { "Ocp-Apim-Subscription-Key": KEY } });
  let text = res.ok ? await res.text() : "";
  if (!text.trim()) text = '{"type":"FeatureCollection","features":[]}';
  await fs.writeFile(cachePath, text);
  return cachePath;
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}
async function downloadAllTiles(api) {
  const tiles = tilesForBbox(pref.bbox, ZOOM);
  let done = 0;
  await pool(tiles, FETCH_CONCURRENCY, async (t) => {
    await ensureTile(api, t.x, t.y, ZOOM);
    done++;
    if (done % 50 === 0 || done === tiles.length) process.stdout.write(`  ${api}: ${done}/${tiles.length}\r`);
  });
  console.log("");
  return tiles;
}

async function loadMuniPolys() {
  const muniGeo = JSON.parse(await fs.readFile(path.join(ROOT, `public/${pref.slug}.geojson`), "utf8"));
  const wardsGeo = pref.hasWards
    ? JSON.parse(await fs.readFile(path.join(ROOT, `public/${pref.slug}_wards.geojson`), "utf8"))
    : { features: [] };
  // ward を先に並べると政令市内の点が ward に割り当てられる
  return [...wardsGeo.features, ...muniGeo.features].map((f) => ({
    code: String(f.properties?.code ?? ""), feat: f, bbox: turf.bbox(f),
    counts: { stations: 0, preschools: 0, medicalFacilities: 0 },
    stationKeys: new Set(),
  }));
}

function pointMuniCode(coords, polys) {
  const pt = turf.point(coords);
  for (const p of polys) {
    const b = p.bbox;
    if (coords[0] < b[0] || coords[0] > b[2] || coords[1] < b[1] || coords[1] > b[3]) continue;
    try { if (turf.booleanPointInPolygon(pt, p.feat)) return p; } catch {}
  }
  return null;
}

// pref.parentToWards から child→parent map を作る
const CHILD_TO_PARENT = new Map();
for (const [parent, children] of Object.entries(pref.parentToWards ?? {})) {
  for (const c of children) CHILD_TO_PARENT.set(c, parent);
}

async function processApi(api, polys, fieldKey, getKey) {
  const tiles = await downloadAllTiles(api);
  console.log(`  Counting ${api} -> ${fieldKey}`);
  const codeToPoly = new Map(polys.map((p) => [p.code, p]));
  let processed = 0;
  for (const t of tiles) {
    processed++;
    if (processed % 50 === 0) process.stdout.write(`  process: ${processed}/${tiles.length}\r`);
    const cachePath = path.join(CACHE_DIR, `${api}_z${ZOOM}_x${t.x}_y${t.y}.json`);
    let fc;
    try { fc = JSON.parse(await fs.readFile(cachePath, "utf8")); } catch { continue; }
    if (!fc?.features?.length) continue;
    for (const f of fc.features) {
      let coords = null;
      const gt = f.geometry?.type;
      if (gt === "Point") coords = f.geometry.coordinates;
      else if (gt === "LineString" || gt === "MultiLineString" || gt === "Polygon" || gt === "MultiPolygon") {
        try { coords = turf.centroid(f).geometry.coordinates; } catch { continue; }
      } else continue;
      if (!coords) continue;
      const p = pointMuniCode(coords, polys);
      if (!p) continue;
      const key = getKey ? getKey(f) : null;
      if (key) { if (p.stationKeys.has(key)) continue; p.stationKeys.add(key); }
      p.counts[fieldKey]++;
      // 政令市親に合算
      const parent = CHILD_TO_PARENT.get(p.code);
      if (parent) {
        const parentP = codeToPoly.get(parent);
        if (parentP) {
          if (key) { if (parentP.stationKeys.has(key)) continue; parentP.stationKeys.add(key); }
          parentP.counts[fieldKey]++;
        }
      }
    }
  }
  console.log("");
}

async function main() {
  const polys = await loadMuniPolys();

  console.log("\n[XKT015] 駅");
  await processApi("XKT015", polys, "stations", (f) => {
    const code = f.properties?.S12_001c;
    if (code) return `code:${code}`;
    const name = f.properties?.S12_001_ja, op = f.properties?.S12_002_ja;
    return name && op ? `n:${name}|${op}` : null;
  });

  console.log("\n[XKT007] 保育園・幼稚園等");
  await processApi("XKT007", polys, "preschools", (f) => {
    const sc = f.properties?.schoolCode;
    if (sc) return `s:${sc}`;
    const n = f.properties?.preSchoolName_ja, loc = f.properties?.location_ja;
    return n ? `p:${n}|${loc ?? ""}` : null;
  });

  console.log("\n[XKT010] 医療機関");
  await processApi("XKT010", polys, "medicalFacilities", (f) => {
    const n = f.properties?.P04_002_ja, loc = f.properties?.P04_003_ja;
    return n ? `m:${n}|${loc ?? ""}` : null;
  });

  const paths = dataPaths(ROOT, pref);
  const muni = JSON.parse(await fs.readFile(paths.muni, "utf8"));
  const wards = paths.wards ? JSON.parse(await fs.readFile(paths.wards, "utf8")) : [];
  const byCode = new Map();
  for (const m of [...muni, ...wards]) byCode.set(m.code, m);

  for (const p of polys) {
    const t = byCode.get(p.code); if (!t) continue;
    t.amenities = {
      stations: p.counts.stations,
      preschools: p.counts.preschools,
      medicalFacilities: p.counts.medicalFacilities,
      source: "国土数値情報（reinfolib XKT015/007/010）",
      asOf: "令和5年度",
    };
  }

  await fs.writeFile(paths.muni, JSON.stringify(muni, null, 2) + "\n");
  if (paths.wards) await fs.writeFile(paths.wards, JSON.stringify(wards, null, 2) + "\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
