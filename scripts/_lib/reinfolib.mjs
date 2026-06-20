// reinfolib（不動産情報ライブラリ）ベクトルタイル取得の共通基盤。
// fetch-hazard / fetch-amenities が共有する: Slippy タイル座標計算・自治体ポリゴンに
// 交差するタイルのみの抽出・200のみキャッシュするタイル取得器・並列プール。

import fs from "node:fs/promises";
import path from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import * as turf from "@turf/turf";

export const REINFOLIB_BASE = "https://www.reinfolib.mlit.go.jp/ex-api/external";

// ===== Slippy map タイル座標 <-> 経緯度 =====
export function lng2tileX(lng, z) {
  return Math.floor(((lng + 180) / 360) * Math.pow(2, z));
}
export function lat2tileY(lat, z) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * Math.pow(2, z));
}
export function tileX2lng(x, z) {
  return (x / Math.pow(2, z)) * 360 - 180;
}
export function tileY2lat(y, z) {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}
/** タイル(x,y,z)の地理 bbox [west, south, east, north] */
export function tileBbox(x, y, z) {
  return [tileX2lng(x, z), tileY2lat(y + 1, z), tileX2lng(x + 1, z), tileY2lat(y, z)];
}
export function bboxIntersects(a, b) {
  return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
}

// 自治体ポリゴンの bbox に交差するタイルだけに絞る。矩形 pref.bbox では
// 北海道・島嶼県は海タイルが大半を占めるため（北海道 z14 で約11万→陸地のみ約3万）、
// 不要な海上タイルの取得を避ける。polys は { bbox:[w,s,e,n], feat } を持つ配列。
export function tilesForPolys(polys, z) {
  let W = Infinity, S = Infinity, E = -Infinity, N = -Infinity;
  for (const p of polys) {
    if (p.bbox[0] < W) W = p.bbox[0];
    if (p.bbox[1] < S) S = p.bbox[1];
    if (p.bbox[2] > E) E = p.bbox[2];
    if (p.bbox[3] > N) N = p.bbox[3];
  }
  const xMin = lng2tileX(W, z), xMax = lng2tileX(E, z);
  const yMin = lat2tileY(N, z), yMax = lat2tileY(S, z);
  const list = [];
  for (let x = xMin; x <= xMax; x++) for (let y = yMin; y <= yMax; y++) {
    const tb = tileBbox(x, y, z); // [w,s,e,n]
    // 1段目: bbox 交差で候補を絞る（多島の自治体は bbox が広く海も含む）
    const cand = polys.filter((p) => bboxIntersects(p.bbox, tb));
    if (cand.length === 0) continue;
    // 2段目: タイル矩形とポリゴン実形状の交差を確認し、海上タイルを除外
    const sq = turf.polygon([[[tb[0], tb[1]], [tb[2], tb[1]], [tb[2], tb[3]], [tb[0], tb[3]], [tb[0], tb[1]]]]);
    if (cand.some((p) => { try { return turf.booleanIntersects(sq, p.feat); } catch { return true; } })) {
      list.push({ x, y });
    }
  }
  return list;
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** items を同時実行数 n で処理する単純な並列プール */
export async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

// public/{pref}.geojson（+ 政令市は _wards.geojson）を読み、タイル交差判定・点内包判定に
// 使う poly 配列を作る。decorate(base) で各スクリプト固有のフィールドを足す。
// wardsFirst=true で ward を先頭に並べる（政令市内の点を親市より先に区へ割り当てたい時）。
export async function loadMuniPolys(rootDir, pref, { wardsFirst = false, decorate = (b) => b } = {}) {
  const muniGeo = JSON.parse(await fs.readFile(path.join(rootDir, `public/${pref.slug}.geojson`), "utf8"));
  const wardsGeo = pref.hasWards
    ? JSON.parse(await fs.readFile(path.join(rootDir, `public/${pref.slug}_wards.geojson`), "utf8"))
    : { features: [] };
  const ordered = wardsFirst
    ? [...wardsGeo.features, ...muniGeo.features]
    : [...muniGeo.features, ...wardsGeo.features];
  return ordered.map((f) => decorate({
    code: String(f.properties?.code ?? ""),
    feat: f,
    bbox: turf.bbox(f),
  }));
}

// reinfolib タイル取得器。cacheDir / apiKey / zoom / concurrency を束ねる。
// 200 のみキャッシュし、429/5xx はリトライ、空データを誤ってキャッシュしない
// （false negative 防止）。最終的に失敗したら throw して中断。
export function createTileFetcher({ cacheDir, apiKey, zoom, concurrency = 4 }) {
  mkdirSync(cacheDir, { recursive: true });

  const tilePath = (api, x, y, z = zoom) =>
    path.join(cacheDir, `${api}_z${z}_x${x}_y${y}.json`);

  async function ensureTile(api, x, y, z = zoom) {
    const cachePath = tilePath(api, x, y, z);
    if (existsSync(cachePath)) return cachePath;
    const url = new URL(`${REINFOLIB_BASE}/${api}`);
    url.searchParams.set("response_format", "geojson");
    url.searchParams.set("z", z); url.searchParams.set("x", x); url.searchParams.set("y", y);
    for (let attempt = 0; attempt < 5; attempt++) {
      let res;
      try { res = await fetch(url, { headers: { "Ocp-Apim-Subscription-Key": apiKey } }); }
      catch { await sleep(500 * (attempt + 1)); continue; }
      if (res.ok) {
        let text = (await res.text()).trim();
        if (!text) text = '{"type":"FeatureCollection","features":[]}';
        await fs.writeFile(cachePath, text);
        return cachePath;
      }
      if (res.status === 429 || res.status >= 500) { await sleep(800 * (attempt + 1)); continue; }
      throw new Error(`${api} z${z}/${x}/${y} -> HTTP ${res.status}`);
    }
    throw new Error(`${api} z${z}/${x}/${y} -> リトライ上限`);
  }

  async function downloadAllTiles(api, polys, { progressEvery = 100 } = {}) {
    const tiles = tilesForPolys(polys, zoom);
    let done = 0;
    await pool(tiles, concurrency, async (t) => {
      await ensureTile(api, t.x, t.y, zoom);
      done++;
      if (done % progressEvery === 0 || done === tiles.length) {
        process.stdout.write(`  ${api}: ${done}/${tiles.length}\r`);
      }
    });
    console.log("");
    return tiles;
  }

  /** キャッシュ済みタイルの FeatureCollection を読む。無ければ null。 */
  async function readTile(api, x, y, z = zoom) {
    try { return JSON.parse(await fs.readFile(tilePath(api, x, y, z), "utf8")); }
    catch { return null; }
  }

  return { zoom, tilePath, ensureTile, downloadAllTiles, readTile };
}
