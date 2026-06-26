// 国土地理院「指定緊急避難場所データ」の全国版CSVから、指定緊急避難場所の点を市区町村
// （政令市は区にも）割り当て、地図プロット用の data/{slug}_shelters.json と、詳細パネル用の
// 件数サマリ（data/{slug}.json の shelters フィールド）を書き出す。
//
// CSV は全国1ファイル（緯度経度＋災害種別フラグ8種）。L01 と同様にワークフロー側で
// curl + unzip して /tmp に展開し、本スクリプトはローカルCSVを読む（zip 依存を持たない）。
//
// 事前（ワークフロー or 手動）:
//   curl -L -o /tmp/hinanbasho.zip "$GSI_SHELTER_URL"
//   unzip -o /tmp/hinanbasho.zip -d /tmp/hinanbasho
//   GSI_SHELTER_CSV=/tmp/hinanbasho/全国データ.csv node scripts/fetch-shelters.mjs --all
//
// 実行: node --max-old-space-size=4096 scripts/fetch-shelters.mjs --all
//       （単一県のみ: --pref=saitama。全国CSVを県ポリゴンの範囲で絞り込む）
//
// 出典URL・年度は変わりうるため env で渡す（docs/data-update.md 参照）:
//   GSI_SHELTER_CSV  展開済みCSVのパス（必須）
//   GSI_SHELTER_ASOF 出典表示の基準時点（既定 "2025"）

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import * as turf from "@turf/turf";
import { resolvePrefs } from "./_lib/prefs.mjs";
import { loadMuni, saveMuni } from "./_lib/data.mjs";
import { loadMuniPolys } from "./_lib/reinfolib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const SHELTER_SOURCE = "国土地理院「指定緊急避難場所データ」";
const SHELTER_NODATA = "未収録";
const ASOF = process.env.GSI_SHELTER_ASOF || "2025";

const CSV_PATH = process.env.GSI_SHELTER_CSV || process.argv.find((a) => a.endsWith(".csv"));
if (!CSV_PATH || !existsSync(CSV_PATH)) {
  console.error(`指定緊急避難場所CSVが見つかりません: ${CSV_PATH ?? "(未指定)"}`);
  console.error('GSI_SHELTER_CSV=/path/to.csv を指定してください（docs/data-update.md 参照）。');
  process.exit(1);
}

// 災害種別フラグのビット（lib/shelters.ts SHELTER_BITS と一致させること）。
const BIT = {
  flood: 1 << 0,
  landslide: 1 << 1,
  highTide: 1 << 2,
  earthquake: 1 << 3,
  tsunami: 1 << 4,
  fire: 1 << 5,
  inlandFlood: 1 << 6,
  volcano: 1 << 7,
};

// CSV ヘッダ名 → ビット。GSI の列名（表記ゆれに緩く部分一致で対応）。
const FLAG_COLUMNS = [
  ["洪水", BIT.flood],
  ["崖崩れ", BIT.landslide], // 崖崩れ、土石流及び地滑り
  ["高潮", BIT.highTide],
  ["地震", BIT.earthquake],
  ["津波", BIT.tsunami],
  ["大規模な火事", BIT.fire],
  ["内水", BIT.inlandFlood], // 内水氾濫
  ["火山", BIT.volcano], // 火山現象
];

// Shift_JIS 優先でデコード（GSI CSV は SJIS が一般的）。失敗時 UTF-8 にフォールバック。
function decodeCsv(buf) {
  for (const enc of ["shift_jis", "utf-8"]) {
    try {
      const text = new TextDecoder(enc, { fatal: false }).decode(buf);
      // 文字化け検知の簡易判定（置換文字が多すぎないこと）。
      const bad = (text.match(/�/g) || []).length;
      if (bad < text.length * 0.002) return text;
    } catch {}
  }
  return new TextDecoder("utf-8").decode(buf);
}

// ダブルクォート対応の最小 CSV パーサ（1行 → セル配列）。
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function colIndex(header, ...needles) {
  for (let i = 0; i < header.length; i++) {
    const h = header[i].replace(/\s/g, "");
    if (needles.some((n) => h.includes(n))) return i;
  }
  return -1;
}

// CSV を読み、全点 [{ lng, lat, h, name, address }] にする。
function loadShelterPoints() {
  const text = decodeCsv(readFileSync(CSV_PATH));
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.length);
  if (!lines.length) return [];
  const header = parseCsvLine(lines[0]);
  const iName = colIndex(header, "施設・場所名", "施設", "名称");
  const iAddr = colIndex(header, "住所", "所在地");
  const iLat = colIndex(header, "緯度");
  const iLng = colIndex(header, "経度");
  const flagIdx = FLAG_COLUMNS.map(([name, bit]) => [colIndex(header, name), bit]).filter(([i]) => i >= 0);
  if (iLat < 0 || iLng < 0) {
    console.error("CSV に緯度/経度の列が見つかりません。ヘッダ:", header.join(" | "));
    process.exit(1);
  }
  const pts = [];
  for (let r = 1; r < lines.length; r++) {
    const cells = parseCsvLine(lines[r]);
    const lat = Number(cells[iLat]);
    const lng = Number(cells[iLng]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue;
    let h = 0;
    for (const [i, bit] of flagIdx) {
      const v = (cells[i] ?? "").trim();
      if (v && v !== "0" && v !== "－" && v !== "-") h |= bit;
    }
    pts.push({
      lng: Math.round(lng * 1e6) / 1e6,
      lat: Math.round(lat * 1e6) / 1e6,
      h,
      name: (iName >= 0 ? cells[iName] : "").trim() || "指定緊急避難場所",
      address: (iAddr >= 0 ? cells[iAddr] : "").trim(),
    });
  }
  return pts;
}

function unionBbox(polys) {
  let W = Infinity, S = Infinity, E = -Infinity, N = -Infinity;
  for (const p of polys) {
    if (p.bbox[0] < W) W = p.bbox[0];
    if (p.bbox[1] < S) S = p.bbox[1];
    if (p.bbox[2] > E) E = p.bbox[2];
    if (p.bbox[3] > N) N = p.bbox[3];
  }
  return [W, S, E, N];
}

function pointPoly(coords, polys) {
  const pt = turf.point(coords);
  for (const p of polys) {
    const b = p.bbox;
    if (coords[0] < b[0] || coords[0] > b[2] || coords[1] < b[1] || coords[1] > b[3]) continue;
    try { if (turf.booleanPointInPolygon(pt, p.feat)) return p; } catch {}
  }
  return null;
}

async function processPref(pref, allPoints) {
  // ward を先に並べ、政令市内の点はまず区へ割り当てる（親市には別途合算）。
  const polys = await loadMuniPolys(ROOT, pref, { wardsFirst: true });
  const [W, S, E, N] = unionBbox(polys);
  const inBbox = allPoints.filter((p) => p.lng >= W && p.lng <= E && p.lat >= S && p.lat <= N);
  console.log(`  ${pref.slug}: 県内候補点 ${inBbox.length}`);

  // child→parent（政令市の区→親市）
  const childToParent = new Map();
  for (const [parent, children] of Object.entries(pref.parentToWards ?? {})) {
    for (const c of children) childToParent.set(c, parent);
  }

  const sitesByCode = new Map(); // code → [{name,address,lng,lat,h}]
  const push = (code, site) => {
    let arr = sitesByCode.get(code);
    if (!arr) { arr = []; sitesByCode.set(code, arr); }
    arr.push(site);
  };

  let matched = 0;
  for (const p of inBbox) {
    const hit = pointPoly([p.lng, p.lat], polys);
    if (!hit) continue;
    matched++;
    const site = { name: p.name, address: p.address, lng: p.lng, lat: p.lat, h: p.h };
    push(hit.code, site);
    const parent = childToParent.get(hit.code);
    if (parent) push(parent, site); // 政令市親へ合算（親ポリゴン選択時に全区の点を見せる）
  }
  console.log(`  ${pref.slug}: 割当 ${matched} / ${sitesByCode.size} 自治体`);

  // 県内に1点も無ければ「未収録」（CSV対象外）。1点でもあれば県内は収録済みとみなす。
  const covered = inBbox.length > 0 && matched > 0;

  // 点データファイル（収録済み自治体のみ）。
  const shelterFile = {};
  for (const [code, sites] of sitesByCode) {
    shelterFile[code] = { source: SHELTER_SOURCE, asOf: ASOF, sites };
  }

  // 件数サマリを data/{slug}.json の各自治体へ反映。
  const { muni, wards, all, paths } = await loadMuni(ROOT, pref);
  for (const m of all) {
    const sites = sitesByCode.get(m.code);
    if (covered) {
      m.shelters = { count: sites ? sites.length : 0, source: SHELTER_SOURCE, asOf: ASOF };
    } else {
      m.shelters = { count: 0, source: SHELTER_NODATA, asOf: "-" };
    }
  }
  await saveMuni(paths, muni, wards);

  const outPath = path.join(ROOT, `data/${pref.slug}_shelters.json`);
  await fs.writeFile(outPath, JSON.stringify(shelterFile, null, 2) + "\n");
  console.log(`  ${pref.slug}: → ${path.relative(ROOT, outPath)} (${Object.keys(shelterFile).length} 自治体, covered=${covered})`);
}

async function main() {
  const prefs = resolvePrefs(process.argv.slice(2));
  console.log(`指定緊急避難場所CSV: ${CSV_PATH}`);
  const points = loadShelterPoints();
  console.log(`全国の点: ${points.length}`);
  for (const pref of prefs) {
    console.log(`\n[${pref.slug}] ${pref.nameJa}`);
    await processPref(pref, points);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
