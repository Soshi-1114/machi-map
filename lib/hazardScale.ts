// 災害リスクの段階スケール（順序尺度）。浸水深ランク・土砂の警戒区分のラベルと配色を
// 単一ソースとして定義する（rentColor と同じく「契約面」として扱う）。
// 段階区分は国土交通省ハザードマップポータルの公開凡例に準拠。配色は緑赤の価値判断を
// 避け、単一色相（amber）の濃淡ランプで強度のみを表す（詳細ページ中立化方針 #42 に追従）。

import type { HazardInfo } from "./types";
import { isHazardEvaluated } from "./coverage";

// ---- 浸水深ランク（洪水 XKT026 / 国交省凡例 6 段階）----
// level: 0=浸水なし, 1..6=深さ段階, -1=評価対象外
export const FLOOD_LEVEL_LABELS = [
  "浸水なし", // 0
  "〜0.5m",   // 1
  "0.5〜3m",  // 2
  "3〜5m",    // 3
  "5〜10m",   // 4
  "10〜20m",  // 5
  "20m〜",    // 6
] as const;
export const FLOOD_MAX_LEVEL = 6;

// ---- 土砂災害（XKT029）----
// level: 0=該当なし, 1=警戒区域(イエロー), 2=特別警戒区域(レッド), -1=評価対象外
export const LANDSLIDE_LEVEL_LABELS = [
  "該当なし",     // 0
  "警戒区域",     // 1
  "特別警戒区域", // 2
] as const;
export const LANDSLIDE_MAX_LEVEL = 2;

// amber 単一色相の濃淡（level が高いほど濃い）。index 0 は「なし」の中立色。
// 既存の地図ハッチ色 #b45309（amber-700）と凡例 #faeeda 系に揃える。
export const FLOOD_COLORS = [
  "#eef2f6", // 0 なし（淡い中立）
  "#fde68a", // 1 amber-200
  "#fcd34d", // 2 amber-300
  "#f59e0b", // 3 amber-500
  "#d97706", // 4 amber-600
  "#b45309", // 5 amber-700
  "#78350f", // 6 amber-900
] as const;

export const HAZARD_NODATA_COLOR = "#d1d5db"; // gray-300（評価対象外。rent と共通）

// ---- 後方互換アクセサ ----
// 新データは floodLevel/landslideLevel（数値）を持つ。旧データ（boolean のみ）は
// hasFloodRisk/hasLandslideRisk から presence(0/1) にフォールバックする。
// 評価対象外（source にセンチネル）は -1。

export function floodLevelOf(h: HazardInfo): number {
  if (!isHazardEvaluated(h.source)) return -1;
  if (typeof h.floodLevel === "number") return h.floodLevel;
  return h.hasFloodRisk ? 1 : 0;
}

export function landslideLevelOf(h: HazardInfo): number {
  if (!isHazardEvaluated(h.source)) return -1;
  if (typeof h.landslideLevel === "number") return h.landslideLevel;
  return h.hasLandslideRisk ? 1 : 0;
}

// 段階値（深さランク）を実際に持つか。旧データの boolean フォールバックと区別し、
// UI が「あり/なし」と「浸水深 3〜5m」のどちらを出すか分岐するのに使う
//（boolean のみのデータで level 1 を「〜0.5m」と誤表示しないため）。
export function floodGraded(h: HazardInfo): boolean {
  return typeof h.floodLevel === "number";
}

export function landslideGraded(h: HazardInfo): boolean {
  return typeof h.landslideLevel === "number";
}

export function floodLevelLabel(level: number): string {
  if (level < 0) return "対象外";
  return FLOOD_LEVEL_LABELS[Math.min(level, FLOOD_MAX_LEVEL)] ?? FLOOD_LEVEL_LABELS[0];
}

export function landslideLevelLabel(level: number): string {
  if (level < 0) return "対象外";
  return LANDSLIDE_LEVEL_LABELS[Math.min(level, LANDSLIDE_MAX_LEVEL)] ?? LANDSLIDE_LEVEL_LABELS[0];
}

export function floodColor(level: number): string {
  if (level < 0) return HAZARD_NODATA_COLOR;
  return FLOOD_COLORS[Math.min(level, FLOOD_MAX_LEVEL)] ?? FLOOD_COLORS[0];
}

// ---- 津波・高潮（沿岸のみ）----
// 深さは reinfolib が文字列バンド（A40_003/A49_003）で返す（津波 "0.3m以上 ～ 1m未満",
// 高潮 "1m以上3m未満" 等、書式も境界も種別で異なる）。バンドの「下限メートル」を取り出して
// 大小比較し、市域内最大の深さバンドを採用する。表示はバンド文字列をそのまま使う。

// バンド文字列の下限メートル。"0.3m以上 ～ 1m未満"→0.3 / "0.3m未満"→0 / "5m以上10m未満"→5。
export function bandLowerMeters(band: string): number {
  const m = String(band ?? "").match(/([\d.]+)\s*m\s*以上/);
  return m ? parseFloat(m[1]) : 0;
}

// 下限メートル → 深さランク 1..8（津波・高潮共通。深いほど大）。0m帯（"〜0.3m未満"等）も
// 浸水ありとして 1 を返す（presence を 0=なし と区別するため）。
export function depthRank(meters: number): number {
  if (meters >= 20) return 8;
  if (meters >= 10) return 7;
  if (meters >= 5) return 6;
  if (meters >= 3) return 5;
  if (meters >= 2) return 4;
  if (meters >= 1) return 3;
  if (meters >= 0.3) return 2;
  return 1;
}

// 津波・高潮アクセサ。データを持たない（旧データ/未取得）は -1（未評価扱い）。
export function tsunamiLevelOf(h: HazardInfo): number {
  return typeof h.tsunamiLevel === "number" ? h.tsunamiLevel : -1;
}
export function stormSurgeLevelOf(h: HazardInfo): number {
  return typeof h.stormSurgeLevel === "number" ? h.stormSurgeLevel : -1;
}

// 沿岸ハザードの表示値。level<0=対象外, 0=想定なし, >=1=深さバンド（depth）をそのまま。
export function coastalHazardLabel(level: number, depth?: string): string {
  if (level < 0) return "対象外";
  if (level === 0) return "想定なし";
  return depth && depth.length > 0 ? `最大 ${depth}` : "想定あり";
}

// ---- 液状化（reinfolib XKT025）----
// liquefaction_tendency_level は小さいほど高リスク（1=非常に液状化しやすい 〜 5=しにくい）。
// 表示は最悪メッシュの note 文字列をそのまま使う（権威ある分類名）。下表は label 欠落時の
// フォールバック（reinfolib XKT025 の実データ note と一致）。-1=未評価（メッシュなし）。
const LIQUEFACTION_LABELS: Record<number, string> = {
  1: "非常に液状化しやすい",
  2: "液状化しやすい",
  3: "やや液状化しやすい",
  4: "やや液状化しにくい",
  5: "液状化しにくい",
};

export function liquefactionLevelOf(h: HazardInfo): number {
  return typeof h.liquefactionLevel === "number" ? h.liquefactionLevel : -1;
}

export function liquefactionLabel(level: number, label?: string): string {
  if (level < 0) return "対象外";
  return label && label.length > 0 ? label : (LIQUEFACTION_LABELS[level] ?? "評価あり");
}

// 注意喚起色を付ける高リスク帯（やや液状化しやすい 以上 = level 1..3）。
export function liquefactionIsRisk(level: number): boolean {
  return level >= 1 && level <= 3;
}
