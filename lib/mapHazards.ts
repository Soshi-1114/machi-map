// 地図のハザード・オーバーレイ定義。種別を1つ選んでアンバーのハッチで重ね、リスクが
// 高いほど濃く（fill-opacity）表示する。可読性のため複数種別は同時に重ねず1種別ずつ。
// 色は緑赤の価値判断を避け単一色相（amber）で強度のみを表す（#42 中立化方針に追従）。
//
// 各種別は MuniSummary の level フィールド（lib/hazardScale.ts のランク）を feature
// property として読む:
//   flood/tsunami/stormSurge: 大きいほど高リスク（0=なし, -1=対象外, >=1 を描画）
//   liquefaction: 小さいほど高リスク（1=非常に〜5=しにくい, -1=未評価）。やや以上(1..3)のみ描画

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

// 自治体集計ハッチ（比較用）→ 実区域ラスタ（GSI公式タイル）に切り替えるズーム閾値。
// これ未満は自治体ハッチ、以上は実際の浸水想定区域ポリゴンを描く。
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
  {
    key: "liquefaction",
    label: "液状化",
    prop: "liquefactionLevel",
    legend: "液状化の傾向（濃いほど液状化しやすい）",
    // 液状化はレベルが小さいほど高リスク。やや液状化しやすい以上（1..3）のみ描画。
    filter: ["all", [">=", ["get", "liquefactionLevel"], 1], ["<=", ["get", "liquefactionLevel"], 3]],
    // 1（非常に）=0.82 → 3（やや）=0.40 の逆順。
    opacity: ["interpolate", ["linear"], ["get", "liquefactionLevel"], 1, 0.82, 3, 0.40],
    gsiLayerIds: ["ekijouka_zenkoku"],
  },
] as const;

export const DEFAULT_HAZARD_KEY: HazardOverlayKey = "none";

export function getHazardOverlay(key: HazardOverlayKey): HazardOverlay | null {
  return HAZARD_OVERLAYS.find((h) => h.key === key) ?? null;
}
