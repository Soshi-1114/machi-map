// reinfolib XKT026 (洪水) + XKT029 (土砂) を pref bbox 内で取得し、市区町村ポリゴンと
// 空間結合して hazard の段階値を判定する。
//   洪水 floodLevel     : 浸水深ランク 1..6（XKT026 属性 A31a_205）の市域内最大。0=なし
//   土砂 landslideLevel : 区域区分 1=警戒/2=特別警戒（XKT029 属性 A33_002）の最大。0=なし
// 段階の意味は lib/hazardScale.ts と同期（FLOOD_LABELS / 区域ラベル）。
//
// 結合は多角形×多角形の booleanIntersects で厳密に行う（市域に少しでも重なる区域を
// 取りこぼさない）。素朴版は候補自治体をタイル bbox で絞っていたため、実形状がそのタイルに
// 無い自治体（L字・対角形で bbox だけ重なる）が、タイル内の数万件のフィーチャすべてに対して
// “不一致”の交差判定を繰り返し（reinfolib の浸水フィーチャは1タイル数万件と高密度）、特に
// 散村型の県で極端に遅かった。対策として、候補をタイル矩形と自治体実形状が交差するものに
// 限定する（タイルごとに1回判定。フィーチャ単位ではない）。これで厳密性を保ったまま無駄な
// フィーチャ判定を排除する。
//
// 実行: node --env-file=.env.local --max-old-space-size=4096 scripts/fetch-hazard.mjs --pref=saitama

import path from "node:path";
import { fileURLToPath } from "node:url";
import * as turf from "@turf/turf";
import { resolvePref } from "./_lib/prefs.mjs";
import { loadMuni, saveMuni } from "./_lib/data.mjs";
import {
  createTileFetcher,
  loadMuniPolys,
  requireReinfolibKey,
  tileBbox,
  bboxIntersects,
} from "./_lib/reinfolib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const pref = resolvePref(process.argv.slice(2));
console.log(`pref: ${pref.slug} (${pref.nameJa})`);

const KEY = requireReinfolibKey();

const ZOOM = 14;
const HAZARD_AS_OF = "2024";

// 浸水深ランク（A31a_205）→ ラベル。lib/hazardScale.ts FLOOD_LEVEL_LABELS と同期。
const FLOOD_LABELS = ["浸水なし", "〜0.5m", "0.5〜3m", "3〜5m", "5〜10m", "10〜20m", "20m〜"];
// 土砂の現象区分コード（A33_001）
const SLIDE_KIND = { 1: "急傾斜地", 2: "土石流", 3: "地すべり" };

// 内陸（海なし）県。津波・高潮は対象外（海に面さないため想定そのものが無い）。
const LANDLOCKED = new Set(["tochigi", "gunma", "saitama", "yamanashi", "nagano", "gifu", "shiga", "nara"]);
const isCoastal = !LANDLOCKED.has(pref.slug);

// 津波/高潮の深さバンド文字列 → 下限メートル/ランク。lib/hazardScale.ts と同期。
// "0.3m以上 ～ 1m未満"→0.3 / "0.3m未満"→0 / "5m以上10m未満"→5
function bandLowerMeters(band) {
  const m = String(band ?? "").match(/([\d.]+)\s*m\s*以上/);
  return m ? parseFloat(m[1]) : 0;
}
function depthRank(meters) {
  if (meters >= 20) return 8;
  if (meters >= 10) return 7;
  if (meters >= 5) return 6;
  if (meters >= 3) return 5;
  if (meters >= 2) return 4;
  if (meters >= 1) return 3;
  if (meters >= 0.3) return 2;
  return 1;
}
// バンド文字列 → ランク 1..8。バンド無し（非浸水フィーチャ）は 0。
function coastalLevel(band) {
  return band ? depthRank(bandLowerMeters(band)) : 0;
}

// 液状化（XKT025）: liquefaction_tendency_level は小さいほど高リスク（1=非常に〜5=しにくい）。
// processHazardForApi は「最大」を採るため、最悪=最小レベルを採るには順位を反転する
// （1→5, 5→1）。不正値は 0（メッシュなし扱い）。
function liqRank(props) {
  const v = Number(props?.liquefaction_tendency_level);
  return v >= 1 && v <= 5 ? 6 - v : 0;
}

// 浸水深ランク 1..6 を取り出す。範囲外/欠損は 0（なし扱い）。
function floodLevel(props) {
  const v = Number(props?.A31a_205);
  return Number.isFinite(v) && v >= 1 && v <= 6 ? v : 0;
}
// 区域区分 1=警戒 / 2=特別警戒。それ以外は 0。
function landslideLevel(props) {
  const v = Number(props?.A33_002);
  return v === 1 || v === 2 ? v : 0;
}

const tiles = createTileFetcher({
  cacheDir: path.join(ROOT, `.cache/reinfolib-tiles/${pref.slug}`),
  apiKey: KEY,
  zoom: ZOOM,
});

// タイル矩形の多角形（候補を実形状で絞るための交差判定用）。
function tileSquare(tb) {
  return turf.polygon([[[tb[0], tb[1]], [tb[2], tb[1]], [tb[2], tb[3]], [tb[0], tb[3]], [tb[0], tb[1]]]]);
}

// 各 API のフィーチャを走査し、自治体に交差する区域の「市域内最大レベル」を field に積む。
// 候補は (1) maxLevel 未満 (2) タイル矩形と実形状が交差、の両方を満たすものに限定する
// （実形状交差はタイルごとに1回だけ判定）。フィーチャ単位ではレベルが現在値より高いものだけ
// booleanIntersects する。collect はメモ用に河川名・現象種類を拾う（レベル上昇時のみ）。
async function processHazardForApi(api, polys, field, getLevel, maxLevel, collect) {
  const tileList = await tiles.downloadAllTiles(api, polys);
  let processed = 0;
  for (const t of tileList) {
    const tb = tileBbox(t.x, t.y, ZOOM);
    const bboxCands = polys.filter((p) => p[field] < maxLevel && bboxIntersects(p.bbox, tb));
    processed++;
    if (processed % 50 === 0) process.stdout.write(`  ${api} check: ${processed}/${tileList.length}, pending: ${polys.filter((p) => p[field] < maxLevel).length}\r`);
    if (bboxCands.length === 0) continue;
    // bbox候補のうち、タイル矩形と実形状が交差するものだけに絞る（無駄なフィーチャ判定を排除）。
    const sq = tileSquare(tb);
    const candidates = bboxCands.filter((p) => {
      try { return turf.booleanIntersects(sq, p.feat); } catch { return true; }
    });
    if (candidates.length === 0) continue;
    const fc = await tiles.readTile(api, t.x, t.y);
    if (!fc?.features?.length) continue;
    for (const haz of fc.features) {
      const lv = getLevel(haz.properties);
      if (lv <= 0) continue;
      let hbbox; try { hbbox = turf.bbox(haz); } catch { continue; }
      for (const c of candidates) {
        if (c[field] >= lv) continue; // 既に同等以上 → 更新不要
        if (!bboxIntersects(c.bbox, hbbox)) continue;
        try {
          if (turf.booleanIntersects(c.feat, haz)) {
            c[field] = lv;
            if (collect) collect(c, haz.properties);
          }
        } catch {}
      }
      if (!candidates.some((c) => c[field] < maxLevel)) break;
    }
  }
  console.log("");
}

async function main() {
  const polys = await loadMuniPolys(ROOT, pref, {
    decorate: (b) => ({
      ...b, floodLevel: 0, landslideLevel: 0, rivers: new Set(), slideKinds: new Set(),
      tsunamiRank: 0, surgeRank: 0, tsunamiBand: "", surgeBand: "",
      liqRank: 0, liqLevel: 0, liqNote: "",
    }),
  });
  console.log(`polys: ${polys.length}  (coastal=${isCoastal})`);

  console.log("\n[XKT026] 洪水");
  await processHazardForApi("XKT026", polys, "floodLevel", floodLevel, 6, (c, p) => {
    if (p.A31a_202) c.rivers.add(String(p.A31a_202));
  });
  console.log("\n[XKT029] 土砂");
  await processHazardForApi("XKT029", polys, "landslideLevel", landslideLevel, 2, (c, p) => {
    const k = SLIDE_KIND[p.A33_001];
    if (k) c.slideKinds.add(k);
  });
  if (isCoastal) {
    console.log("\n[XKT028] 津波");
    await processHazardForApi("XKT028", polys, "tsunamiRank", (p) => coastalLevel(p.A40_003), 8, (c, p) => {
      if (p.A40_003) c.tsunamiBand = String(p.A40_003);
    });
    console.log("\n[XKT027] 高潮");
    await processHazardForApi("XKT027", polys, "surgeRank", (p) => coastalLevel(p.A49_003), 8, (c, p) => {
      if (p.A49_003) c.surgeBand = String(p.A49_003);
    });
  } else {
    console.log("\n[XKT028/027] 津波・高潮: 内陸県のため対象外（スキップ）");
  }
  console.log("\n[XKT025] 液状化");
  await processHazardForApi("XKT025", polys, "liqRank", liqRank, 5, (c, p) => {
    c.liqLevel = Number(p.liquefaction_tendency_level);
    c.liqNote = String(p.note ?? "");
  });

  const { muni, wards, all, paths } = await loadMuni(ROOT, pref);
  const byCode = new Map(all.map((m) => [m.code, m]));

  for (const p of polys) {
    const t = byCode.get(p.code); if (!t) continue;
    // 評価対象外（北方領土など reinfolib 圏外）は既存の対象外センチネルを保持し上書きしない。
    if (t.hazard && /対象外|未評価/.test(t.hazard.source)) continue;
    t.hazard = {
      hasFloodRisk: p.floodLevel > 0,
      hasLandslideRisk: p.landslideLevel > 0,
      floodLevel: p.floodLevel,
      landslideLevel: p.landslideLevel,
      // 津波・高潮: 内陸県は -1（対象外）、沿岸県は 0=想定なし / 1..8=深さランク。
      tsunamiLevel: isCoastal ? p.tsunamiRank : -1,
      tsunamiDepth: isCoastal && p.tsunamiRank > 0 ? p.tsunamiBand : "",
      stormSurgeLevel: isCoastal ? p.surgeRank : -1,
      stormSurgeDepth: isCoastal && p.surgeRank > 0 ? p.surgeBand : "",
      // 液状化: メッシュ無し(liqRank 0)は -1（未評価）、有れば元レベル(1=最悪..5)と傾向テキスト。
      liquefactionLevel: p.liqRank > 0 ? p.liqLevel : -1,
      liquefactionLabel: p.liqRank > 0 ? p.liqNote : "",
      note: buildNote(p),
      source: `国土数値情報（reinfolib ${isCoastal ? "XKT025/026/027/028/029" : "XKT025/026/029"}）`,
      asOf: HAZARD_AS_OF,
    };
  }

  await saveMuni(paths, muni, wards);

  const f = all.filter((m) => m.hazard.hasFloodRisk).length;
  const l = all.filter((m) => m.hazard.hasLandslideRisk).length;
  const fMax = Math.max(0, ...all.map((m) => m.hazard.floodLevel ?? 0));
  const ts = all.filter((m) => (m.hazard.tsunamiLevel ?? -1) > 0).length;
  const ss = all.filter((m) => (m.hazard.stormSurgeLevel ?? -1) > 0).length;
  const lq = all.filter((m) => { const v = m.hazard.liquefactionLevel ?? -1; return v >= 1 && v <= 3; }).length;
  console.log(`Total: flood=${f}/${all.length} (maxLevel=${fMax}), landslide=${l}/${all.length}, tsunami=${ts}, stormSurge=${ss}, liquefaction(prone)=${lq}`);
}

// 段階値とメモ素材（河川名・現象種類）から note を組み立てる。
function buildNote(p) {
  const parts = [];
  if (p.floodLevel > 0) {
    const rivers = [...p.rivers].slice(0, 3).join("・");
    const depth = FLOOD_LABELS[p.floodLevel] ?? "";
    parts.push(rivers ? `浸水想定 最大${depth}（${rivers}）` : `浸水想定 最大${depth}`);
  }
  if (p.landslideLevel > 0) {
    const zone = p.landslideLevel === 2 ? "特別警戒区域" : "警戒区域";
    const kinds = [...p.slideKinds].join("・");
    parts.push(kinds ? `土砂災害${zone}（${kinds}）` : `土砂災害${zone}`);
  }
  if (p.tsunamiRank > 0) parts.push(`津波浸水想定 最大${p.tsunamiBand}`);
  if (p.surgeRank > 0) parts.push(`高潮浸水想定 最大${p.surgeBand}`);
  // 液状化は高リスク帯（レベル1..3＝やや以上）のみ note に出す。
  if (p.liqRank > 0 && p.liqLevel >= 1 && p.liqLevel <= 3) parts.push(`液状化: ${p.liqNote}`);
  return parts.length === 0 ? "顕著な災害想定区域なし" : parts.join(" / ");
}

main().catch((e) => { console.error(e); process.exit(1); });
