// reinfolib ハザード各 API の「実際のプロパティ名」を 1 タイルだけ取得して確認する調査用スクリプト。
// 浸水深ランク（XKT026）・土砂の警戒/特別警戒区分（XKT029）・津波/高潮/液状化の
// フィールド名を実データで確定するために使う。fetch-hazard.mjs の段階値抽出を
// 実装する前に、このスクリプトで属性名を必ず確認すること。
//
// 実行: node --env-file=.env.local scripts/probe-hazard-attrs.mjs
//       node --env-file=.env.local scripts/probe-hazard-attrs.mjs --lat=36.695 --lng=137.213

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createTileFetcher,
  requireReinfolibKey,
  lng2tileX,
  lat2tileY,
} from "./_lib/reinfolib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ZOOM = 14;

// 各 API を確実に踏むための既知のリスク地点。
// 内陸の河川氾濫・土砂・液状化＝富山市付近 / 沿岸の津波・高潮＝高知市付近。
const SPOTS = [
  { name: "富山市付近(内陸: 洪水/土砂/液状化)", lat: 36.695, lng: 137.213, apis: ["XKT026", "XKT029", "XKT025"] },
  { name: "高知市付近(沿岸: 津波/高潮)", lat: 33.559, lng: 133.531, apis: ["XKT028", "XKT027"] },
];

function parseArg(name) {
  const a = process.argv.slice(2).find((s) => s.startsWith(`--${name}=`));
  return a ? a.split("=")[1] : null;
}

async function probe() {
  const KEY = requireReinfolibKey();
  const tiles = createTileFetcher({
    cacheDir: path.join(ROOT, ".cache/reinfolib-tiles/_probe"),
    apiKey: KEY,
    zoom: ZOOM,
  });

  const latArg = parseArg("lat");
  const lngArg = parseArg("lng");
  const spots = latArg && lngArg
    ? [{ name: "custom", lat: +latArg, lng: +lngArg, apis: ["XKT026", "XKT029", "XKT027", "XKT028", "XKT025"] }]
    : SPOTS;

  for (const spot of spots) {
    const x = lng2tileX(spot.lng, ZOOM);
    const y = lat2tileY(spot.lat, ZOOM);
    console.log(`\n### ${spot.name}  z${ZOOM}/${x}/${y}`);
    for (const api of spot.apis) {
      try {
        await tiles.ensureTile(api, x, y, ZOOM);
        const fc = await tiles.readTile(api, x, y, ZOOM);
        const feats = fc?.features ?? [];
        console.log(`\n[${api}] features=${feats.length}`);
        if (!feats.length) {
          console.log("  (このタイルに該当フィーチャなし。別地点を --lat/--lng で試す)");
          continue;
        }
        const keys = new Set();
        for (const f of feats) for (const k of Object.keys(f.properties ?? {})) keys.add(k);
        console.log("  property keys:", [...keys].join(", "));
        for (const f of feats.slice(0, 3)) console.log("  sample:", JSON.stringify(f.properties));
      } catch (e) {
        console.log(`[${api}] ERROR: ${e.message}`);
      }
    }
  }
}

probe().catch((e) => { console.error(e); process.exit(1); });
