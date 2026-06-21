// 地図コロプレスの「切替可能な指標」定義。家賃・地価（数値の5段階）と
// 人口トレンド（5カテゴリの発散配色）を1つの型で扱い、MapView から色式・凡例・
// ツールチップ整形をデータ駆動で参照する。しきい値/配色は契約面として固定。

import { RENT_THRESHOLDS, RENT_COLORS, RENT_NODATA_COLOR } from "./rentColor";
import type { Municipality } from "./types";

const NODATA_COLOR = RENT_NODATA_COLOR; // gray-300 を欠損色として全指標で共通化

export type MapMetricKey = "rent" | "landPrice" | "populationTrend";

type NumericLegend = {
  kind: "numeric";
  colors: readonly string[];
  scaleLabels: readonly string[]; // 5セルのバー下に並ぶ境界ラベル
};
type CategoricalLegend = {
  kind: "categorical";
  items: readonly { color: string; label: string }[];
};

export type MapMetric = {
  key: MapMetricKey;
  label: string;        // レイヤーパネルのラジオ表示
  legendTitle: string;  // 凡例の見出し
  description: string;  // レイヤーパネルで「今どの色か」を説明する1行（出典つき）
  nodataLabel: string;  // 凡例「データなし」行の補足
  legend: NumericLegend | CategoricalLegend;
  /** MapLibre の fill-color 式（feature properties を読む） */
  colorExpression: () => unknown;
  /** ツールチップ/検索用の値整形。プロパティ値を受け取り表示文字列を返す */
  formatValue: (raw: unknown) => string;
};

// 数値指標 → MapLibre step 式。<=0（センチネル）はデータなし色。
function numericStepExpression(
  property: string,
  thresholds: readonly number[],
  colors: readonly string[],
): unknown {
  const step: unknown[] = ["step", ["get", property], colors[0]];
  for (let i = 0; i < thresholds.length; i++) {
    step.push(thresholds[i], colors[i + 1]);
  }
  return [
    "case",
    ["<=", ["to-number", ["get", property], 0], 0], NODATA_COLOR,
    step,
  ];
}

function formatYen(raw: unknown, unit: string): string {
  const v = Number(raw);
  if (!Number.isFinite(v) || v <= 0) return "データなし";
  return `${v.toLocaleString()} ${unit}`;
}

// 人口トレンドの5カテゴリ（減少→増加）を紫→緑の発散配色で。
// 赤緑ダイバージングは P/D 型色覚で識別困難なため、色覚多様性に配慮した
// ColorBrewer PRGn（紫⇔緑）を採用。「増加=緑」の直感は維持しつつ減少側を紫に。
// 横ばいは near-white として、データなし（gray-300 #d1d5db）と明確に分離する。
const TREND_ITEMS = [
  { value: "減少", color: "#762a83" }, // PRGn purple-700
  { value: "微減", color: "#af8dc3" }, // PRGn purple-300
  { value: "横ばい", color: "#f7f7f7" }, // PRGn neutral（near-white）
  { value: "微増", color: "#7fbf7b" }, // PRGn green-300
  { value: "増加", color: "#1b7837" }, // PRGn green-700
] as const;

export const MAP_METRICS: readonly MapMetric[] = [
  {
    key: "rent",
    label: "家賃",
    legendTitle: "民営借家中央値（円/月）",
    description: "民営借家の1か月あたり家賃の中央値（住宅・土地統計調査）。",
    nodataLabel: "データなし（住宅統計の集計対象外）",
    legend: {
      kind: "numeric",
      colors: RENT_COLORS,
      // ～5万 / 5.5万 / 6万 / 6.5万～（5セルの境界4つ）
      scaleLabels: [
        `～${RENT_THRESHOLDS[0] / 10000}万`,
        ...RENT_THRESHOLDS.slice(1, -1).map((t) => `${t / 10000}万`),
        `${RENT_THRESHOLDS[RENT_THRESHOLDS.length - 1] / 10000}万～`,
      ],
    },
    colorExpression: () => numericStepExpression("rent", RENT_THRESHOLDS, RENT_COLORS),
    formatValue: (raw) => formatYen(raw, "円/月"),
  },
  {
    key: "landPrice",
    label: "地価",
    legendTitle: "住宅地地価（円/㎡）",
    description: "住宅地の標準地1㎡あたりの地価公示価格（地価公示 L01）。",
    nodataLabel: "データなし（標準地なし等）",
    legend: {
      kind: "numeric",
      // 家賃と同じ青系5段階を流用（指標が排他表示なので混同しない）
      colors: RENT_COLORS,
      scaleLabels: ["～1万", "2.5万", "5万", "10万～"],
    },
    colorExpression: () =>
      numericStepExpression("landPrice", [10000, 25000, 50000, 100000], RENT_COLORS),
    formatValue: (raw) => formatYen(raw, "円/㎡"),
  },
  {
    key: "populationTrend",
    label: "人口トレンド",
    legendTitle: "人口トレンド",
    description: "国勢調査に基づく直近の人口増減の傾向（紫=減少／緑=増加）。",
    nodataLabel: "データなし",
    legend: {
      kind: "categorical",
      items: TREND_ITEMS.map((t) => ({ color: t.color, label: t.value })),
    },
    colorExpression: () => [
      "match",
      ["get", "popTrend"],
      ...TREND_ITEMS.flatMap((t) => [t.value, t.color]),
      NODATA_COLOR,
    ],
    formatValue: (raw) => {
      const s = String(raw ?? "");
      return s || "データなし";
    },
  },
];

export const DEFAULT_METRIC_KEY: MapMetricKey = "rent";

export function getMapMetric(key: MapMetricKey): MapMetric {
  return MAP_METRICS.find((m) => m.key === key) ?? MAP_METRICS[0];
}

// MuniSummary.populationTrend を feature property に流す際のキー名（colorExpression と一致させる）
export const TREND_PROPERTY = "popTrend";

export type PopulationTrend = Municipality["populationTrend"];
