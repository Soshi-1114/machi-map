// 住みやすさ「総合スコア」と5軸評価の算出。
//
// honesty 方針: スコアは実データ指標のみを入力とする透明な関数で、欠損（対象外・
// 非公表）の指標はスコアから除外し母数を補正する（捏造しない）。各軸のしきい値は
// 固定・明示（rentColor/hazardScale と同じく「契約面」）で、UI には「目安」「対象X/5
// 指標から算出」と必ず併記する。LLM 生成は使わず、総評・おすすめもルールベースで
// 同じ軸スコアから導く（buildOverview / buildRecommendations）。
//
// 注意: アクセス・生活インフラ軸は施設の実数しきい値を用いるため、規模の大きい
// 自治体ほど高く出る傾向がある。あくまで利便性の目安であり優劣ではない（UI で明示）。
//
// 法務方針により治安・犯罪は軸に含めない（代わりに「生活インフラ」を5軸目に置く）。

import type { Municipality } from "./types";
import { hasRent } from "./rentColor";
import { isWaitlistDisclosed } from "./waitlist";
import { isHazardEvaluated, isAmenitiesCounted } from "./coverage";
import {
  floodLevelOf,
  landslideLevelOf,
  liquefactionLevelOf,
  liquefactionIsRisk,
  tsunamiLevelOf,
  stormSurgeLevelOf,
} from "./hazardScale";

export type AxisKey = "access" | "rent" | "childcare" | "disaster" | "infrastructure";

export type AxisScore = {
  key: AxisKey;
  label: string;
  /** 1..5（星）。null = データなし（対象外・非公表）でスコア対象外。 */
  stars: number | null;
  /** UI 用の短い補足（実データ由来）。 */
  note: string;
};

export type Livability = {
  /** 0..100。算出可能な軸が1つもなければ null。 */
  score: number | null;
  /** 5段階換算（score/20）。星表示用。 */
  stars: number;
  axes: AxisScore[];
  /** 算出に使えた軸の数。 */
  evaluated: number;
  /** 軸の総数（=5）。 */
  total: number;
};

function clampStar(n: number): number {
  return Math.max(1, Math.min(5, n));
}

// ---- 家賃（手頃さ）: 安いほど高評価。RENT_THRESHOLDS と同じ境界を共有 ----
function rentStar(m: Municipality): AxisScore {
  if (!hasRent(m.rent.value)) {
    return { key: "rent", label: "家賃", stars: null, note: "集計対象外" };
  }
  const v = m.rent.value;
  const stars = v < 50000 ? 5 : v < 55000 ? 4 : v < 60000 ? 3 : v < 65000 ? 2 : 1;
  return { key: "rent", label: "家賃", stars, note: `中央値 ${v.toLocaleString()}円/月` };
}

// ---- 子育て: 待機児童が少ないほど高評価 ----
function childcareStar(m: Municipality): AxisScore {
  if (!isWaitlistDisclosed(m.waitlistChildren)) {
    return { key: "childcare", label: "子育て", stars: null, note: "区別非公表" };
  }
  const w = m.waitlistChildren.value;
  const stars = w === 0 ? 5 : w < 10 ? 4 : w < 50 ? 3 : w < 200 ? 2 : 1;
  return {
    key: "childcare",
    label: "子育て",
    stars,
    note: w === 0 ? "待機児童ゼロ" : `待機児童 ${w}人`,
  };
}

// ---- 災害: リスクが低いほど高評価。各ハザードの段階値から減点 ----
function disasterStar(m: Municipality): AxisScore {
  if (!isHazardEvaluated(m.hazard.source)) {
    return { key: "disaster", label: "災害", stars: null, note: "評価対象外" };
  }
  const h = m.hazard;
  let penalty = 0;
  const flood = floodLevelOf(h); // 0..6
  penalty += Math.min(flood, 4); // 浸水深が深いほど（最大-4）
  const landslide = landslideLevelOf(h); // 0..2
  penalty += landslide; // 警戒-1 / 特別警戒-2
  if (liquefactionIsRisk(liquefactionLevelOf(h))) penalty += 1;
  if (tsunamiLevelOf(h) > 0) penalty += 1;
  if (stormSurgeLevelOf(h) > 0) penalty += 1;
  const stars = clampStar(5 - penalty);
  const note =
    penalty === 0 ? "目立ったリスクなし" : flood > 0 ? `浸水想定あり` : "一部にリスクあり";
  return { key: "disaster", label: "災害", stars, note };
}

// ---- アクセス: 駅数（多いほど高評価）----
function accessStar(m: Municipality): AxisScore {
  if (!m.amenities || !isAmenitiesCounted(m.amenities.source)) {
    return { key: "access", label: "アクセス", stars: null, note: "集計対象外" };
  }
  const s = m.amenities.stations;
  const stars = s >= 30 ? 5 : s >= 15 ? 4 : s >= 5 ? 3 : s >= 1 ? 2 : 1;
  return { key: "access", label: "アクセス", stars, note: `駅 ${s.toLocaleString()}` };
}

// ---- 生活インフラ: 医療機関・保育施設の数（利便性の目安）----
function infrastructureStar(m: Municipality): AxisScore {
  if (!m.amenities || !isAmenitiesCounted(m.amenities.source)) {
    return { key: "infrastructure", label: "生活インフラ", stars: null, note: "集計対象外" };
  }
  const med = m.amenities.medicalFacilities;
  const pre = m.amenities.preschools;
  const medStar = med >= 80 ? 5 : med >= 40 ? 4 : med >= 15 ? 3 : med >= 5 ? 2 : 1;
  const preStar = pre >= 80 ? 5 : pre >= 40 ? 4 : pre >= 15 ? 3 : pre >= 5 ? 2 : 1;
  const stars = clampStar(Math.round((medStar + preStar) / 2));
  return {
    key: "infrastructure",
    label: "生活インフラ",
    stars,
    note: `医療 ${med.toLocaleString()}・保育 ${pre.toLocaleString()}`,
  };
}

// 軸の表示順（mock の並び。治安は除外し生活インフラを5軸目に）。
const AXIS_BUILDERS: ((m: Municipality) => AxisScore)[] = [
  accessStar,
  rentStar,
  childcareStar,
  disasterStar,
  infrastructureStar,
];

/** 自治体の住みやすさスコア（0-100）と5軸評価を実データから算出する。 */
export function computeLivability(m: Municipality): Livability {
  const axes = AXIS_BUILDERS.map((fn) => fn(m));
  const available = axes.filter((a) => a.stars !== null) as (AxisScore & { stars: number })[];
  if (available.length === 0) {
    return { score: null, stars: 0, axes, evaluated: 0, total: axes.length };
  }
  const avgStars = available.reduce((s, a) => s + a.stars, 0) / available.length;
  return {
    score: Math.round(avgStars * 20),
    stars: avgStars,
    axes,
    evaluated: available.length,
    total: axes.length,
  };
}

/** スコア帯のラベル（中立寄りの言い回し）。 */
export function scoreBandLabel(score: number): string {
  if (score >= 85) return "とても住みやすい";
  if (score >= 70) return "住みやすい";
  if (score >= 55) return "バランス良好";
  if (score >= 40) return "標準的";
  return "個性的";
}

/**
 * ルールベースの「AIによるエリア総評」（3〜5文）。LLM ではなく軸スコアと実数値から
 * 構成する。シグネチャは将来 LLM 生成に差し替え可能な形を維持（buildSummary と同方針）。
 */
export function buildOverview(m: Municipality, liv: Livability): string {
  const name = m.displayName ?? m.name;
  const parts: string[] = [];

  if (liv.score !== null) {
    parts.push(`${name}の住みやすさ総合スコアは${liv.score}点（${scoreBandLabel(liv.score)}）です。`);
  } else {
    parts.push(`${name}は、公表データの一部が対象外のため総合スコアは算出していません。`);
  }

  const strengths = liv.axes.filter((a) => a.stars !== null && a.stars >= 4);
  const watchouts = liv.axes.filter((a) => a.stars !== null && a.stars <= 2);

  if (strengths.length > 0) {
    parts.push(`特に${strengths.map((a) => a.label).join("・")}の評価が高いエリアです。`);
  }
  if (m.amenities && isAmenitiesCounted(m.amenities.source)) {
    parts.push(
      `生活利便施設は駅${m.amenities.stations}・保育/幼稚園${m.amenities.preschools}・医療機関${m.amenities.medicalFacilities}を数えます。`,
    );
  }
  if (watchouts.length > 0) {
    parts.push(`一方で${watchouts.map((a) => a.label).join("・")}は留意したいポイントです。`);
  }
  parts.push("数値は政府統計の実データに基づく目安です。");
  return parts.join("");
}

export type Recommendation = { axis: AxisKey | "general"; text: string };

/** 「こんな人におすすめ」をルールベースで導く（強み軸 stars>=4 から）。 */
export function buildRecommendations(_m: Municipality, liv: Livability): Recommendation[] {
  const recs: Recommendation[] = [];
  const strong = (key: AxisKey) => liv.axes.find((a) => a.key === key && a.stars !== null && a.stars >= 4);

  if (strong("access")) recs.push({ axis: "access", text: "通勤・通学で交通利便性を重視する方" });
  if (strong("rent")) recs.push({ axis: "rent", text: "家賃を抑えたい単身者・学生" });
  if (strong("childcare")) recs.push({ axis: "childcare", text: "保育環境を重視する子育て世帯" });
  if (strong("disaster")) recs.push({ axis: "disaster", text: "災害リスクの低さを重視する方" });
  if (strong("infrastructure"))
    recs.push({ axis: "infrastructure", text: "買い物・医療など生活利便性を重視する方" });

  if (recs.length === 0) {
    recs.push({ axis: "general", text: "実データで各エリアをじっくり比較したい方" });
  }
  return recs.slice(0, 4);
}
