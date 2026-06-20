// reinfolib XKT026 (洪水) + XKT029 (土砂) を pref bbox 内で取得し、
// 市区町村ポリゴンと空間結合して hazard.hasFloodRisk / hasLandslideRisk を判定。
//
// 実行: node --env-file=.env.local --max-old-space-size=4096 scripts/fetch-hazard.mjs --pref=saitama

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as turf from "@turf/turf";
import { resolvePref, dataPaths } from "./_lib/prefs.mjs";
import {
  createTileFetcher,
  loadMuniPolys,
  tileBbox,
  bboxIntersects,
} from "./_lib/reinfolib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const pref = resolvePref(process.argv.slice(2));
console.log(`pref: ${pref.slug} (${pref.nameJa})`);

const KEY = process.env.REINFOLIB_API_KEY;
if (!KEY) { console.error("REINFOLIB_API_KEY が未設定"); process.exit(1); }

const ZOOM = 14;
const tiles = createTileFetcher({
  cacheDir: path.join(ROOT, `.cache/reinfolib-tiles/${pref.slug}`),
  apiKey: KEY,
  zoom: ZOOM,
});

async function processHazardForApi(api, polys, riskField) {
  const tileList = await tiles.downloadAllTiles(api, polys);
  let processed = 0;
  for (const t of tileList) {
    const tb = tileBbox(t.x, t.y, ZOOM);
    const candidates = polys.filter((p) => !p[riskField] && bboxIntersects(p.bbox, tb));
    processed++;
    if (processed % 50 === 0) process.stdout.write(`  ${api} check: ${processed}/${tileList.length}, pending: ${polys.filter((p) => !p[riskField]).length}\r`);
    if (candidates.length === 0) continue;
    const fc = await tiles.readTile(api, t.x, t.y);
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
  }
  console.log("");
}

async function main() {
  const polys = await loadMuniPolys(ROOT, pref, {
    decorate: (b) => ({ ...b, hasFlood: false, hasLandslide: false }),
  });
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
