// 指定緊急避難場所（避難場所）のドメインロジック。
//
// 出典は国土地理院「指定緊急避難場所データ」（市町村別CSVを全国版で配布。緯度経度＋
// 災害種別フラグ8種を持つ点データ）。家賃や地価のような自治体集計のコロプレスではなく、
// 「災害オーバーレイがON かつ 市区町村を選択中」のときに、その災害に有効な避難場所だけを
// 地図に点でプロットする用途に使う（lib/mapHazards.ts のハザード種別と連動）。
//
// 値の正直さ（honesty 方針）: 市町村が未指定・データ未収録の場合は source にセンチネル
// （SHELTER_NODATA）を持たせ、UI は「0件」と「未収録」を区別する（hasShelterData 参照）。
// 避難場所が0件と「データがまだ無い」は意味が違うため、決して 0 件と見せない。

import type { HazardOverlayKey } from "./mapHazards";
import { getPrefByCode } from "./prefs";

export const SHELTER_SOURCE = "国土地理院「指定緊急避難場所データ」";
// 地図ソースに付すアトリビューション（GSI コンテンツ利用規約の出典表記）。
export const SHELTER_ATTRIBUTION =
  '<a href="https://www.gsi.go.jp/bousaichiri/hinanbasho.html" target="_blank" rel="noopener">指定緊急避難場所データ（国土地理院）</a>';
// 市町村が未指定／データ未収録のセンチネル（isHazardEvaluated と同じ「未」系の語）。
export const SHELTER_NODATA = "未収録";

export function hasShelterData(source: string): boolean {
  const s = String(source ?? "");
  return !!s && !s.includes("未収録") && !s.includes("対象外");
}

// 災害種別フラグのビット位置（国土地理院CSVの列順に対応）。点ごとの h（bitmask）に詰める。
export const SHELTER_BITS = {
  flood: 1 << 0, // 洪水
  landslide: 1 << 1, // 崖崩れ、土石流及び地滑り
  highTide: 1 << 2, // 高潮
  earthquake: 1 << 3, // 地震
  tsunami: 1 << 4, // 津波
  fire: 1 << 5, // 大規模な火事
  inlandFlood: 1 << 6, // 内水氾濫
  volcano: 1 << 7, // 火山現象
} as const;

// 地図のハザード・オーバーレイ種別 → その災害で「有効」な避難場所のビット条件。
// 液状化は指定緊急避難場所の災害種別に項目が無いため、起因となる地震フラグで代替する。
export const HAZARD_TO_SHELTER_BITS: Record<Exclude<HazardOverlayKey, "none">, number> = {
  flood: SHELTER_BITS.flood | SHELTER_BITS.inlandFlood,
  landslide: SHELTER_BITS.landslide,
  tsunami: SHELTER_BITS.tsunami,
  stormSurge: SHELTER_BITS.highTide,
  liquefaction: SHELTER_BITS.earthquake,
};

export function shelterMatchesHazard(h: number, key: Exclude<HazardOverlayKey, "none">): boolean {
  return (h & HAZARD_TO_SHELTER_BITS[key]) !== 0;
}

// data/{slug}_shelters.json に格納する1点の形（軽量化のため bitmask の h を持つ）。
export type ShelterSite = {
  name: string;
  address?: string;
  lng: number;
  lat: number;
  h: number; // 災害種別 bitmask（SHELTER_BITS）
};

// 自治体コード → その自治体内の避難場所エントリ。
export type ShelterEntry = {
  source: string;
  asOf: string;
  sites: ShelterSite[];
};

export type ShelterFile = Record<string, ShelterEntry>;

// API が地図に返す1点の properties。地図側の filter を ["==",["get",hazardKey],true] の
// 単純式にできるよう、オーバーレイ種別ごとの真偽を展開して持たせる（bitmask の解釈を
// ここ1か所に閉じ込め、MapLibre 式に bit 演算を持ち込まない）。
export type ShelterFeatureProps = {
  name: string;
  address: string;
  flood: boolean;
  landslide: boolean;
  tsunami: boolean;
  stormSurge: boolean;
  liquefaction: boolean;
};

const OVERLAY_KEYS: Exclude<HazardOverlayKey, "none">[] = [
  "flood",
  "landslide",
  "tsunami",
  "stormSurge",
  "liquefaction",
];

/** 1点を GeoJSON Feature（オーバーレイ種別ごとの真偽を展開）に変換。 */
export function siteToFeature(s: ShelterSite): GeoJSON.Feature<GeoJSON.Point, ShelterFeatureProps> {
  const props = {
    name: s.name,
    address: s.address ?? "",
  } as ShelterFeatureProps;
  for (const k of OVERLAY_KEYS) props[k] = shelterMatchesHazard(s.h, k);
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [s.lng, s.lat] },
    properties: props,
  };
}

/** エントリ全点を FeatureCollection に変換（API レスポンス本体）。 */
export function entryToFeatureCollection(
  entry: ShelterEntry,
): GeoJSON.FeatureCollection<GeoJSON.Point, ShelterFeatureProps> {
  return {
    type: "FeatureCollection",
    features: entry.sites.map(siteToFeature),
  };
}

// pref データと同様、slug 別 JSON を動的 import で読む（必要時のみ該当 chunk をロード）。
// まだ収録されていない pref はファイルが無い／空 {} のため、解決できなければ空オブジェクト。
const cache = new Map<string, Promise<ShelterFile>>();

async function loadShelterFile(slug: string): Promise<ShelterFile> {
  let p = cache.get(slug);
  if (!p) {
    p = import(`../data/${slug}_shelters.json`)
      .then((m) => (m.default ?? m) as ShelterFile)
      .catch(() => ({} as ShelterFile));
    cache.set(slug, p);
  }
  return p;
}

/** 自治体コードから避難場所エントリを返す。未収録は null。 */
export async function getShelters(code: string): Promise<ShelterEntry | null> {
  const pref = getPrefByCode(code);
  if (!pref) return null;
  const file = await loadShelterFile(pref.slug);
  return file[code] ?? null;
}
