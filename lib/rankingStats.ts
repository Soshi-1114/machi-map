// 各ランキングにおける自治体の順位を1度だけ算出してキャッシュする集計レイヤー
// （詳細ページのランキングカードで「全国◯位」を出すため）。foreignStats と同方針で、
// 全 pref 横断データから rankBy（lib/rankings.ts）の整列を流用する。
//
// ランキングは market-level（政令市の行政区を除外）。よって行政区(level:"ward")の
// 詳細ページは順位を持たない＝lookup は undefined になり、UI 側でリンクのみ表示する。

import { RANKINGS, rankBy, muniLevelOnly } from "./rankings";
import type { Municipality } from "./types";

export type RankPos = { rank: number; total: number };

export function buildRankPositions(all: Municipality[]): Map<string, Map<string, RankPos>> {
  const munis = muniLevelOnly(all);
  const out = new Map<string, Map<string, RankPos>>();
  for (const def of RANKINGS) {
    const ranked = rankBy(def, munis);
    const byCode = new Map<string, RankPos>();
    ranked.forEach((m, i) => byCode.set(m.code, { rank: i + 1, total: ranked.length }));
    out.set(def.slug, byCode);
  }
  return out;
}

let cache: Map<string, Map<string, RankPos>> | null = null;

/** 全 pref 横断のランキング順位表を返す（初回のみ構築してキャッシュ）。 */
export async function getRankPositions(): Promise<Map<string, Map<string, RankPos>>> {
  if (!cache) {
    const { listAllAcrossPrefs } = await import("./metrics");
    cache = buildRankPositions(await listAllAcrossPrefs());
  }
  return cache;
}
