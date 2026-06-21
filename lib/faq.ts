// 詳細ページの「よくある質問」を自治体データから生成する。可視テキストと
// FAQPage 構造化データの両方で同じソースを使い、内容を一致させる（Google の
// FAQ は回答がページ上に可視であることが要件のため）。
//
// 回答はすべて実データ由来で、欠損は推計せず「データなし／対象外」と明示する
// （honesty 方針）。出典ヘルパーは lib/ の既存判定を再利用する。

import type { Municipality } from "./types";
import { hasRent, rentBand } from "./rentColor";
import { hasLandPrice } from "./landPrice";
import { isWaitlistDisclosed } from "./waitlist";
import { isHazardEvaluated, coverageReason } from "./coverage";

export type QA = { q: string; a: string };

export function buildFaq(m: Municipality, prefName: string): QA[] {
  const name = m.name;
  const qa: QA[] = [];

  // 家賃
  qa.push({
    q: `${name}の家賃相場（民営借家中央値）はいくらですか？`,
    a: hasRent(m.rent.value)
      ? `${name}の民営借家の家賃中央値は${m.rent.value.toLocaleString()}円/月です。${prefName}内では家賃水準は${rentBand(m.rent.value)}に位置します（出典: ${m.rent.source}）。`
      : `${name}は住宅・土地統計調査の集計対象外のため、家賃中央値のデータはありません。`,
  });

  // 待機児童
  qa.push({
    q: `${name}に待機児童はいますか？`,
    a: isWaitlistDisclosed(m.waitlistChildren)
      ? m.waitlistChildren.value === 0
        ? `${name}の待機児童数は0人（待機児童ゼロ）です（出典: こども家庭庁）。`
        : `${name}の待機児童数は${m.waitlistChildren.value}人です（出典: こども家庭庁）。`
      : `${name}は政令指定都市の区のため、待機児童数は区別に公表されていません（市単位での公表）。`,
  });

  // 災害リスク
  qa.push({
    q: `${name}の災害リスク（浸水・土砂災害）はどうですか？`,
    a: isHazardEvaluated(m.hazard.source)
      ? `${name}の浸水想定区域は「${m.hazard.hasFloodRisk ? "あり" : "なし"}」、土砂災害警戒区域は「${m.hazard.hasLandslideRisk ? "あり" : "なし"}」です${m.hazard.note ? `（${m.hazard.note}）` : ""}。`
      : `${name}はハザード評価の対象外です（${coverageReason(m.hazard.source)}）。`,
  });

  // 地価（データのある自治体のみ）
  if (hasLandPrice(m.landPrice.value)) {
    qa.push({
      q: `${name}の地価（住宅地）はいくらですか？`,
      a: `${name}の住宅地の地価は${m.landPrice.value.toLocaleString()}円/㎡です（出典: ${m.landPrice.source}）。`,
    });
  }

  return qa;
}
