// 家賃→色の5段階コロプレス。しきい値は固定（型と同じく契約面）。
// 配色は視認性とブランド性で随時更新可。
export const RENT_THRESHOLDS = [50000, 55000, 60000, 65000] as const;

// Tailwind blue 系の5段階。淡→濃でしっかり差が出る視認性重視。
export const RENT_COLORS = [
  "#dbeafe", // blue-100
  "#93c5fd", // blue-300
  "#60a5fa", // blue-400
  "#2563eb", // blue-600
  "#1e3a8a", // blue-900
] as const;

// 家賃データなし（住宅統計対象外の小町村など。value<=0 をセンチネルとする）の色。
// 実際の民営借家中央値が 0 になることはないので 0/未満を欠損として扱える。
export const RENT_NODATA_COLOR = "#d1d5db"; // gray-300

/** 家賃が有効値（実データ）かどうか。0/未満はデータなしのプレースホルダ。 */
export function hasRent(value: number): boolean {
  return value > 0;
}

// 家賃水準のテキスト表記。コロプレスの色しきい値（RENT_THRESHOLDS）と同じ境界を
// 単一ソースとして共有する（詳細ページ等の文章表現用）。
export const RENT_BAND_LABELS = ["低め", "やや低め", "中位", "やや高め", "高め"] as const;

export function rentBand(value: number): string {
  let i = 0;
  while (i < RENT_THRESHOLDS.length && value >= RENT_THRESHOLDS[i]) i++;
  return RENT_BAND_LABELS[i];
}

export function rentColor(value: number): string {
  if (!hasRent(value)) return RENT_NODATA_COLOR;
  if (value < RENT_THRESHOLDS[0]) return RENT_COLORS[0];
  if (value < RENT_THRESHOLDS[1]) return RENT_COLORS[1];
  if (value < RENT_THRESHOLDS[2]) return RENT_COLORS[2];
  if (value < RENT_THRESHOLDS[3]) return RENT_COLORS[3];
  return RENT_COLORS[4];
}

// MapLibre `step` 表現として家賃 → 色を返す。
// rent<=0（データなし）はグレー、それ以外を5段階のコロプレスで塗る。
export function rentStepExpression(): unknown {
  return [
    "case",
    ["<=", ["to-number", ["get", "rent"], 0], 0], RENT_NODATA_COLOR,
    [
      "step",
      ["get", "rent"],
      RENT_COLORS[0],
      RENT_THRESHOLDS[0], RENT_COLORS[1],
      RENT_THRESHOLDS[1], RENT_COLORS[2],
      RENT_THRESHOLDS[2], RENT_COLORS[3],
      RENT_THRESHOLDS[3], RENT_COLORS[4],
    ],
  ];
}
