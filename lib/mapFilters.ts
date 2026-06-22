// 地図の「条件フィルタ」定義。家賃上限・地価上限・浸水リスクなしで自治体を絞り込み、
// 非該当を減光する（非表示にはしない＝地理的文脈を残す）。判定ロジックは
// JS版（件数カウント用）と MapLibre 式版（描画用）を同じ条件で二重に持つ。

import type { MuniSummary } from "./types";

export type MapFilters = {
  rentMax: number | null;   // 家賃上限（円/月）。null=条件なし
  landMax: number | null;   // 地価上限（円/㎡）。null=条件なし
  floodMax: number | null;  // 許容する最大浸水深ランク（0..6）。null=条件なし。0=浸水なしに限定
};

export const EMPTY_FILTERS: MapFilters = { rentMax: null, landMax: null, floodMax: null };

// 浸水深の上限セグメント。値は lib/hazardScale.ts の浸水深ランク（0=なし, 2=0.5〜3m, 3=3〜5m）。
export const FLOOD_MAX_OPTIONS = [
  { label: "浸水なし", value: 0 },
  { label: "〜3m", value: 2 },
  { label: "〜5m", value: 3 },
] as const;

// セグメント選択肢（離散値の方がスライダーよりデータスケールに合い操作も明確）
export const RENT_MAX_OPTIONS = [
  { label: "5万", value: 50000 },
  { label: "6万", value: 60000 },
  { label: "7万", value: 70000 },
] as const;

export const LAND_MAX_OPTIONS = [
  { label: "5万", value: 50000 },
  { label: "10万", value: 100000 },
  { label: "20万", value: 200000 },
] as const;

export function isFilterActive(f: MapFilters): boolean {
  return f.rentMax != null || f.landMax != null || f.floodMax != null;
}

// 件数カウント用の JS 判定。欠損（rent/landPrice<=0）は「条件を満たすと確認できない」
// ため、その指標で絞り込み中なら非該当扱い。floodMax は「評価済み（floodLevel>=0）かつ
// 浸水深ランクが上限以下」のみ該当とし、reinfolib 圏外で未評価（-1）の自治体を“安全”扱い
// しない（honesty）。floodMax=0 は浸水なしに限定（旧 noFlood 相当）。
export function matchesFilter(m: MuniSummary, f: MapFilters): boolean {
  if (f.rentMax != null && !(m.rent > 0 && m.rent <= f.rentMax)) return false;
  if (f.landMax != null && !(m.landPrice > 0 && m.landPrice <= f.landMax)) return false;
  if (f.floodMax != null && !(m.floodLevel >= 0 && m.floodLevel <= f.floodMax)) return false;
  return true;
}

// 描画用の MapLibre 式。フィルタ無効なら null（呼び出し側で減光レイヤーを消す）。
// JS版 matchesFilter と必ず同一条件にすること（件数と地図表示の一致が本機能の肝）。
export function buildMatchExpression(f: MapFilters): unknown | null {
  if (!isFilterActive(f)) return null;
  const clauses: unknown[] = [];
  if (f.rentMax != null) {
    const rent = ["to-number", ["get", "rent"], 0];
    clauses.push(["all", [">", rent, 0], ["<=", rent, f.rentMax]]);
  }
  if (f.landMax != null) {
    const land = ["to-number", ["get", "landPrice"], 0];
    clauses.push(["all", [">", land, 0], ["<=", land, f.landMax]]);
  }
  if (f.floodMax != null) {
    // floodLevel>=0（評価済み）かつ <=上限。未評価(-1)は非該当として減光側へ（honesty）。
    const lvl = ["to-number", ["get", "floodLevel"], -1];
    clauses.push(["all", [">=", lvl, 0], ["<=", lvl, f.floodMax]]);
  }
  return ["all", ...clauses];
}
