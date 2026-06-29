// 地図のハザード・オーバーレイ定義。種別は複数選択でき、拡大時（HAZARD_ZONE_ZOOM 以上）に
// 国土地理院の実区域ラスタタイルで重ねて表示する。低ズームの自治体集計ハッチ（斜線）は
// 「ほぼ全自治体に乗り意味を成さない」ため廃止し、閾値未満では UI 側でズーム誘導を出す。
//
// filter/opacity 式は MuniSummary の level フィールド（lib/hazardScale.ts のランク）を
// feature property として読む。現状ラスタ主体の描画では実描画には使わないが、将来の
// 自治体単位の絞り込み等に備えて定義として保持する:
//   flood/tsunami/stormSurge: 大きいほど高リスク（0=なし, -1=対象外, >=1 を描画）

export type HazardOverlayKey = "none" | "flood" | "landslide" | "tsunami" | "stormSurge" | "liquefaction";

export type HazardOverlay = {
  key: Exclude<HazardOverlayKey, "none">;
  label: string;       // セレクタ表示
  prop: string;        // MuniSummary feature property 名
  legend: string;      // 凡例の説明（出典の主旨）
  filter: unknown;     // 描画対象（presence）の MapLibre 式
  opacity: unknown;    // fill-opacity（リスクが高いほど濃い）の MapLibre 式
  // 国土地理院ハザードマップポータルのラスタタイル レイヤーID（実区域描画用）。
  // 土砂災害は土石流/急傾斜/地すべりの3レイヤーを重ねるため配列。
  gsiLayerIds: readonly string[];
};

// 実区域ラスタ（GSI公式タイル）を表示し始めるズーム閾値。これ未満は地図に何も重ねず、
// 凡例で「ズームすると災害リスク区域を表示します」と誘導する。
export const HAZARD_ZONE_ZOOM = 12;

// 国土地理院 ハザードマップポータルの公開ラスタタイル（APIキー不要・CORS可）。
// 出典表記「ハザードマップポータルサイト」が必須。
export const GSI_HAZARD_ATTRIBUTION =
  '<a href="https://disaportal.gsi.go.jp/" target="_blank" rel="noopener">ハザードマップポータルサイト</a>';

export function gsiTileUrl(layerId: string): string {
  return `https://disaportaldata.gsi.go.jp/raster/${layerId}/{z}/{x}/{y}.png`;
}

// 浸水深ランク 1..6 → 不透明度（既存の HAZARD_DEPTH_OPACITY と同値）。
const FLOOD_OPACITY = [
  "step", ["get", "floodLevel"],
  0,
  1, 0.34, 2, 0.44, 3, 0.54, 4, 0.64, 5, 0.74, 6, 0.82,
];

// 津波・高潮の深さランク 1..8 → 0.30..0.82 の線形。
function bandOpacity(prop: string): unknown {
  return ["interpolate", ["linear"], ["get", prop], 1, 0.30, 8, 0.82];
}

export const HAZARD_OVERLAYS: readonly HazardOverlay[] = [
  {
    key: "flood",
    label: "浸水",
    prop: "floodLevel",
    legend: "洪水浸水想定（濃いほど深い）",
    filter: [">", ["get", "floodLevel"], 0],
    opacity: FLOOD_OPACITY,
    gsiLayerIds: ["01_flood_l2_shinsuishin_data"],
  },
  {
    key: "landslide",
    label: "土砂",
    prop: "landslideLevel",
    legend: "土砂災害警戒区域（濃い=特別警戒）",
    filter: [">", ["get", "landslideLevel"], 0],
    // 1=警戒(イエロー)=0.5 → 2=特別警戒(レッド)=0.82。
    opacity: ["interpolate", ["linear"], ["get", "landslideLevel"], 1, 0.5, 2, 0.82],
    // 土石流 / 急傾斜地の崩壊 / 地すべり の3レイヤーを重ねる。
    gsiLayerIds: ["05_dosekiryukeikaikuiki", "05_kyukeishakeikaikuiki", "05_jisuberikeikaikuiki"],
  },
  {
    key: "tsunami",
    label: "津波",
    prop: "tsunamiLevel",
    legend: "津波浸水想定（濃いほど深い・沿岸のみ）",
    filter: [">", ["get", "tsunamiLevel"], 0],
    opacity: bandOpacity("tsunamiLevel"),
    gsiLayerIds: ["04_tsunami_newlegend_data"],
  },
  {
    key: "stormSurge",
    label: "高潮",
    prop: "stormSurgeLevel",
    legend: "高潮浸水想定（濃いほど深い・沿岸のみ）",
    filter: [">", ["get", "stormSurgeLevel"], 0],
    opacity: bandOpacity("stormSurgeLevel"),
    gsiLayerIds: ["03_hightide_l2_shinsuishin_data"],
  },
  // 液状化（液状化傾向）は地図プロットに反映できる実区域タイルが安定して取得できず、
  // 選択しても地図に何も出ないため、オーバーレイの選択肢からは外している。
  // 種別キー自体（避難所の対応災害フラグ等）は lib/shelters.ts で引き続き利用する。
] as const;

export const DEFAULT_HAZARD_KEY: HazardOverlayKey = "none";

// 浸水・津波・高潮は国（国交省）の同一「浸水深」カラースケールで描かれる公式ラスタの
// ため、地図上で重ねると色で区別できない。UI ではこの3種を排他選択にする（土砂・避難所は
// 併用可）。凡例も「浸水深」共通スケールを1つだけ表示する。
export const INUNDATION_KEYS = ["flood", "tsunami", "stormSurge"] as const;

export function isInundationKey(key: string): boolean {
  return (INUNDATION_KEYS as readonly string[]).includes(key);
}

export function getHazardOverlay(key: HazardOverlayKey): HazardOverlay | null {
  return HAZARD_OVERLAYS.find((h) => h.key === key) ?? null;
}
