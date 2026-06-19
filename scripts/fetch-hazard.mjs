// reinfolib XKT026 (洪水) + XKT029 (土砂) を pref bbox 内で取得し、
// 市区町村ポリゴンと空間結合して hazard.hasFloodRisk / hasLandslideRisk を判定。
//
// 実行: node --env-file=.env.local --max-old-space-size=4096 scripts/fetch-hazard.mjs --pref=saitama

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
const ZOOM = 14;
const FETCH_CONCURRENCY = 4;

function lng2tileX(lng, z) { return Math.floor(((lng + 180) / 360) * Math.pow(2, z)); }
function lat2tileY(lat, z) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * Math.pow(2, z));
}
function tileX2lng(x, z) { return (x / Math.pow(2, z)) * 360 - 180; }
function tileY2lat(y, z) {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}
function tileBbox(x, y, z) {
  return [tileX2lng(x, z), tileY2lat(y + 1, z), tileX2lng(x + 1, z), tileY2lat(y, z)];
}
function tilesForBbox(bbox, z) {
  const xMin = lng2tileX(bbox.west, z), xMax = lng2tileX(bbox.east, z);
  const yMin = lat2tileY(bbox.north, z), yMax = lat2tileY(bbox.south, z);
  const list = [];
  for (let x = xMin; x <= xMax; x++) for (let y = yMin; y <= yMax; y++) list.push({ x, y });
  return list;
}
function bboxIntersects(a, b) { return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]); }

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
    while (i < items.length) { await fn(items[i++]); }
  }));
}
async function downloadAllTiles(api) {
  const tiles = tilesForBbox(pref.bbox, ZOOM);
  let done = 0;
  await pool(tiles, FETCH_CONCURRENCY, async (t) => {
    await ensureTile(api, t.x, t.y, ZOOM);
    done++;
    if (done % 100 === 0 || done === tiles.length) process.stdout.write(`  ${api}: ${done}/${tiles.length}\r`);
  });
  console.log("");
  return tiles;
}

async function loadMuniPolys() {
  const muniGeo = JSON.parse(await fs.readFile(path.join(ROOT, `public/${pref.slug}.geojson`), "utf8"));
  const wardsGeo = pref.hasWards
    ? JSON.parse(await fs.readFile(path.join(ROOT, `public/${pref.slug}_wards.geojson`), "utf8"))
    : { features: [] };
  return [...muniGeo.features, ...wardsGeo.features].map((f) => ({
    code: String(f.properties?.code ?? ""), feat: f, bbox: turf.bbox(f),
    hasFlood: false, hasLandslide: false,
  }));
}

async function processHazardForApi(api, polys, riskField) {
  const tiles = await downloadAllTiles(api);
  let processed = 0;
  for (const t of tiles) {
    const tb = tileBbox(t.x, t.y, ZOOM);
    const candidates = polys.filter((p) => !p[riskField] && bboxIntersects(p.bbox, tb));
    processed++;
    if (processed % 50 === 0) process.stdout.write(`  ${api} check: ${processed}/${tiles.length}, pending: ${polys.filter((p) => !p[riskField]).length}\r`);
    if (candidates.length === 0) continue;
    const cachePath = path.join(CACHE_DIR, `${api}_z${ZOOM}_x${t.x}_y${t.y}.json`);
    let fc;
    try { fc = JSON.parse(await fs.readFile(cachePath, "utf8")); } catch { continue; }
    if (!fc?.features?.length) continue;
    for (const haz of fc.features) {
      let hbbox; try { hbbox = turf.bbox(haz); } catch { continue; }
      for (const c of candidates) {
        if (c[riskField]) continue;
        if (!bboxIntersects(c.bbox, hbbox)) continue;
        try { if (turf.booleanIntersects(c.feat, haz)) c[riskField] = true; } catch {}
      }
      if (!candidates.some((c) => !c[riskField])) break;
    }
    fc = null;
  }
  console.log("");
}

async function main() {
  const polys = await loadMuniPolys();
  console.log(`polys: ${polys.length}`);

  console.log("\n[XKT026] 洪水"); await processHazardForApi("XKT026", polys, "hasFlood");
  console.log("\n[XKT029] 土砂"); await processHazardForApi("XKT029", polys, "hasLandslide");

  const paths = dataPaths(ROOT, pref);
  const muni = JSON.parse(await fs.readFile(paths.muni, "utf8"));
  const wards = paths.wards ? JSON.parse(await fs.readFile(paths.wards, "utf8")) : [];
  const byCode = new Map();
  for (const m of [...muni, ...wards]) byCode.set(m.code, m);

  for (const p of polys) {
    const t = byCode.get(p.code); if (!t) continue;
    t.hazard = {
      hasFloodRisk: !!p.hasFlood, hasLandslideRisk: !!p.hasLandslide,
      note: buildNote(p.hasFlood, p.hasLandslide),
      source: "国土数値情報（reinfolib XKT026/029）", asOf: "2024",
    };
  }

  await fs.writeFile(paths.muni, JSON.stringify(muni, null, 2) + "\n");
  if (paths.wards) await fs.writeFile(paths.wards, JSON.stringify(wards, null, 2) + "\n");

  const all = [...muni, ...wards];
  const f = all.filter((m) => m.hazard.hasFloodRisk).length;
  const l = all.filter((m) => m.hazard.hasLandslideRisk).length;
  console.log(`Total: flood=${f}/${all.length}, landslide=${l}/${all.length}`);
}

function buildNote(flood, landslide) {
  const p = [];
  if (flood) p.push("浸水想定区域あり");
  if (landslide) p.push("土砂災害警戒区域あり");
  return p.length === 0 ? "顕著な災害想定区域なし" : p.join(" / ");
}

main().catch((e) => { console.error(e); process.exit(1); });
