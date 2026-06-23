// 詳細ページの「よくある質問」を自治体データから生成する。可視テキストと
// FAQPage 構造化データの両方で同じソースを使い、内容を一致させる（Google の
// FAQ は回答がページ上に可視であることが要件のため）。LLM/AI Overview に引用され
// やすいよう、回答は冒頭に結論＋数値を置くファクトベースで書く。
//
// 回答はすべて実データ由来で、欠損は推計せず「データなし／対象外」と明示する
// （honesty 方針）。データのない設問は出さない（薄い設問の乱立を避ける）。
// 出典ヘルパーは lib/ の既存判定を再利用する。

import type { Municipality } from "./types";
import { hasRent, rentBand } from "./rentColor";
import { hasLandPrice } from "./landPrice";
import { isWaitlistDisclosed } from "./waitlist";
import { isHazardEvaluated, isAmenitiesCounted, coverageReason } from "./coverage";
import { buildSummary } from "./summary";
import { hasForeignData, foreignRatioPct } from "./foreignResidents";
import {
  floodLevelOf,
  landslideLevelOf,
  floodGraded,
  landslideGraded,
  floodLevelLabel,
  landslideLevelLabel,
  liquefactionLevelOf,
  liquefactionLabel,
} from "./hazardScale";

export type QA = { q: string; a: string };

export function buildFaq(m: Municipality, prefName: string): QA[] {
  const name = m.name;
  const qa: QA[] = [];

  // 住みやすさ総合（常時）。サマリ文を再利用し人口を添える＝「○○ 住みやすい」需要を拾う。
  qa.push({
    q: `${name}は住みやすいですか？`,
    a: `${buildSummary(m)} 人口は${m.population.toLocaleString()}人です。家賃・地価・子育て・災害リスク・外国人住民比率を政府統計の実データで近隣自治体と比較できます。`,
  });

  // 家賃
  qa.push({
    q: `${name}の家賃相場（民営借家中央値）はいくらですか？`,
    a: hasRent(m.rent.value)
      ? `${name}の民営借家の家賃中央値は${m.rent.value.toLocaleString()}円/月です。${prefName}内では家賃水準は${rentBand(m.rent.value)}に位置します（出典: ${m.rent.source}）。`
      : `${name}は住宅・土地統計調査の集計対象外のため、家賃中央値のデータはありません。`,
  });

  // 地価（データのある自治体のみ）
  if (hasLandPrice(m.landPrice.value)) {
    qa.push({
      q: `${name}の地価（住宅地）はいくらですか？`,
      a: `${name}の住宅地の地価は${m.landPrice.value.toLocaleString()}円/㎡です（出典: ${m.landPrice.source}）。`,
    });
  }

  // 人口（常時）
  qa.push({
    q: `${name}の人口は何人ですか？`,
    a: `${name}の人口は${m.population.toLocaleString()}人で、最近の人口トレンドは「${m.populationTrend}」です（国勢調査）。`,
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

  // 災害リスク（浸水・土砂）
  qa.push({
    q: `${name}の災害リスク（浸水・土砂災害）はどうですか？`,
    a: isHazardEvaluated(m.hazard.source)
      ? `${name}の${floodGraded(m.hazard)
          ? `浸水想定区域は最大「${floodLevelLabel(floodLevelOf(m.hazard))}」`
          : `浸水想定区域は「${m.hazard.hasFloodRisk ? "あり" : "なし"}」`}、${landslideGraded(m.hazard)
          ? `土砂災害は「${landslideLevelLabel(landslideLevelOf(m.hazard))}」`
          : `土砂災害警戒区域は「${m.hazard.hasLandslideRisk ? "あり" : "なし"}」`}です${m.hazard.note ? `（${m.hazard.note}）` : ""}。`
      : `${name}はハザード評価の対象外です（${coverageReason(m.hazard.source)}）。`,
  });

  // 液状化（評価済み＝メッシュありの自治体のみ）。「○○ 液状化」という固有需要を拾う。
  if (liquefactionLevelOf(m.hazard) >= 1) {
    qa.push({
      q: `${name}は液状化しやすいですか？`,
      a: `${name}の液状化の傾向は「${liquefactionLabel(liquefactionLevelOf(m.hazard), m.hazard.liquefactionLabel)}」です。地点ごとの危険度は国土地理院の重ねるハザードマップで確認できます。`,
    });
  }

  // 生活インフラ（集計対象の自治体のみ）。交通＝駅数 / 医療＝医療機関数。
  if (m.amenities && isAmenitiesCounted(m.amenities.source)) {
    qa.push({
      q: `${name}の交通の便はどうですか？（駅の数）`,
      a: `${name}内の駅数は${m.amenities.stations.toLocaleString()}駅です（出典: ${m.amenities.source}）。`,
    });
    qa.push({
      q: `${name}の医療・子育て施設はどのくらいありますか？`,
      a: `${name}の医療機関数は${m.amenities.medicalFacilities.toLocaleString()}件、保育・幼稚園・認定こども園は${m.amenities.preschools.toLocaleString()}施設です（出典: ${m.amenities.source}）。`,
    });
  }

  // 外国人住民比率（調査対象の自治体のみ）。多様性・国際性の中立的な指標として提示。
  if (hasForeignData(m.foreignResidents.source)) {
    qa.push({
      q: `${name}の外国人住民の割合はどのくらいですか？`,
      a: `${name}の外国人住民は${m.foreignResidents.value.toLocaleString()}人で、人口に占める割合は約${foreignRatioPct(m).toFixed(1)}%です（出典: ${m.foreignResidents.source}、${m.foreignResidents.asOf}）。多様性・国際性の目安として確認できます。`,
    });
  }

  return qa;
}
