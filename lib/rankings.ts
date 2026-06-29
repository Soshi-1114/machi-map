// 全国ランキングページのデータ駆動定義。地図指標(mapMetrics)や県集計(prefStats)と
// 同じく「指標の定義を1か所に集約し、ページは定義から描画する」方針。
//
// 対象は market-level の1自治体＝1エントリにするため、政令市の行政区(level:"ward")は
// 除外して親市との重複を避ける。東京23特別区は tokyo.json 上 level:"muni" なので含まれる。

import type { Municipality } from "./types";
import { hasRent } from "./rentColor";
import { hasLandPrice } from "./landPrice";
import { isWaitlistDisclosed } from "./waitlist";
import { hasForeignData, foreignRatioPct } from "./foreignResidents";
import { prefNameOf } from "./site";

export type RankingDef = {
  slug: string;
  /** ページ H1 / 見出し用のフレーズ */
  title: string;
  /** ランキング一覧・パンくず用の短いラベル */
  shortLabel: string;
  /** meta description のひな型（{top1} を1位自治体名に置換） */
  description: string;
  /**
   * description で表現しきれない動的な meta description を、1位自治体（null=該当なし）
   * から実データで組み立てる任意フック。指定時は description より優先する。
   */
  metaDescription?: (top1: Municipality | null) => string;
  /** 本文リード */
  lead: string;
  /** リード直後に添える中立的な注記（データの位置づけなど。任意） */
  note?: string;
  /**
   * ロングテール薄ページ対策の導入文（段落配列。各 {top1} を1位自治体名に置換）。
   * 上位・下位の傾向を中立的に解説し、検索意図に応えるリッチなテキストを置く。
   */
  intro?: string[];
  /** ランキング固有のFAQ（可視テキストと FAQPage 構造化データで同一ソースを共有）。 */
  faq?: { q: string; a: string }[];
  /** 県別ページの導入文（県名を差し込む。薄ページ対策＋ロングテール「{県} 外国人 割合」）。 */
  prefIntro?: (prefName: string) => string[];
  /** 県別ページで全国平均・県平均の外国人住民比率ベンチマークを表示するか。 */
  compareForeignAvg?: boolean;
  /**
   * H1/見出しに添える鮮度ラベルを1位自治体（=データ asOf）から導出する任意フック。
   * 例: 「2024年12月最新」。指定が無い／null の場合は既定の「全国」を使う。
   */
  freshnessLabel?: (top1: Municipality | null) => string | null;
  /** テーブルの値カラム見出し */
  columnLabel: string;
  order: "asc" | "desc";
  /** 候補に含める条件（対象外・データなしを除外） */
  qualifies: (m: Municipality) => boolean;
  /** 並び替えキー */
  sortValue: (m: Municipality) => number;
  /** 値カラムの表示テキスト */
  display: (m: Municipality) => string;
};

// 外国人住民比率ランキングの中立フレーミング注記（データの位置づけ）。
const FOREIGN_NOTE =
  "外国人住民比率は多様性・国際性の目安です（出典: 出入国在留管理庁「在留外国人統計」）。比率の高い／低いという事実を示すもので、住みやすさ等の価値判断とは無関係です。";

// "2024-12" → "2024年12月"。データ asOf を見出しの鮮度ラベルへ整形する。
export function formatAsOfJa(asOf: string): string {
  const m = /^(\d{4})-(\d{1,2})$/.exec(asOf ?? "");
  if (m) return `${m[1]}年${Number(m[2])}月`;
  const y = /^(\d{4})$/.exec(asOf ?? "");
  if (y) return `${y[1]}年`;
  return asOf ?? "";
}

// 外国人住民比率ランキングの鮮度ラベル（1位自治体の asOf 由来）。例「2024年12月最新」。
function foreignFreshnessLabel(top1: Municipality | null): string | null {
  if (!top1) return null;
  return `${formatAsOfJa(top1.foreignResidents.asOf)}最新`;
}

// 外国人住民比率ランキングの導入文（薄ページ対策・中立フレーミング）。high/low で傾向解説を分岐。
function foreignIntro(highLow: "高い" | "低い"): string[] {
  const trend =
    highLow === "高い"
      ? "上位には、製造業の集積地や大学・技能実習の受け入れが多い地域、観光・サービス業の盛んな自治体が並ぶ傾向があります。比率が高い地域は、外国語対応や多文化共生の取り組みが進んでいる場合があります。"
      : "下位には、人口規模の小さい町村や、外国人の就労・居住の拠点が少ない地域が並ぶ傾向があります。比率が低いことは、その地域の特性を示す事実であり、優劣を意味するものではありません。";
  return [
    `このページは、全国の市区町村を人口に占める外国人住民の割合（在留外国人数 ÷ 人口）が${highLow}順に並べたランキングです。各順位の自治体名から、その地域の在留外国人数・人口・人口推移などの住環境データを地図とあわせて確認できます。`,
    `${trend}外国人住民比率は地域の多様性・国際性を読み解く客観的な指標のひとつで、住みやすさ等の価値判断とは切り離して中立的にご覧ください。`,
    "数値は出入国在留管理庁「在留外国人統計」と国勢調査人口の実データから算出しており、推計値は含みません。政令指定都市の行政区は親市との重複を避けるため集計から除外しています。",
  ];
}

// 県別ページの導入文（「{県} 外国人 割合」「{県} 市町村 外国人 多い」を狙う）。
function foreignPrefIntro(highLow: "高い" | "低い") {
  return (prefName: string): string[] => {
    const trend =
      highLow === "高い"
        ? "上位の自治体ほど、人口に占める外国人住民の割合が高い地域です。"
        : "上位（＝割合が低い順）の自治体ほど、人口に占める外国人住民の割合が低い地域です。";
    return [
      `このページは、${prefName}内の市区町村を人口に占める外国人住民の割合が${highLow}順に並べたランキングです。${trend}各自治体名から、在留外国人数・人口・人口推移などの住環境データを地図とあわせて確認できます。`,
      `${prefName}全体の平均（県平均）や全国平均と比べてどの程度かを下のベンチマークで確認できます。外国人住民比率は地域の多様性・国際性を読み解く客観的な指標で、住みやすさ等の価値判断とは無関係です。数値は出入国在留管理庁「在留外国人統計」と国勢調査人口の実データで、推計値は含みません。`,
    ];
  };
}

// 外国人住民比率ランキング共通のFAQ（FAQPage 構造化データ＋可視テキスト）。
const FOREIGN_FAQ: { q: string; a: string }[] = [
  {
    q: "外国人住民比率とは何ですか？",
    a: "その市区町村に住む外国人住民の数を、総人口で割った割合（%）です。本サイトでは出入国在留管理庁「在留外国人統計」の在留外国人数と、国勢調査の人口から算出しています。",
  },
  {
    q: "データの出典と基準時点は？",
    a: "在留外国人数は出入国在留管理庁「在留外国人統計」（e-Stat 経由）、人口は国勢調査の公表値です。いずれも政府統計の実データで、推計値や補完値は使用していません。",
  },
  {
    q: "外国人住民比率が高い・低いことに良し悪しはありますか？",
    a: "ありません。比率は地域の多様性・国際性を読み解く客観的な指標のひとつであり、住みやすさや治安などの価値判断とは無関係です。本サイトは事実として中立に提示しています。",
  },
  {
    q: "政令指定都市の区はどう扱っていますか？",
    a: "親市との重複を避けるため、政令指定都市の行政区はランキングの集計対象から除外しています。東京23特別区は市区町村単位で集計対象に含めています。",
  },
];

// 1位自治体（実データ）から「名前・比率・基準年」を含む meta description を組み立てる。
function foreignMetaDescription(highLow: "高い" | "低い") {
  return (top1: Municipality | null): string => {
    const head = `全国の市区町村を外国人住民比率が${highLow}順にランキング。`;
    if (!top1) return `${head}多様性・国際性の目安として、出入国在留管理庁「在留外国人統計」の実データで比較できます。`;
    const name = `${prefNameOf(top1.pref)}${top1.displayName ?? top1.name}`;
    const ratio = foreignRatioPct(top1).toFixed(2);
    return `${head}${highLow === "高い" ? "最も比率が高い" : "最も比率が低い"}のは${name}（${ratio}%、${top1.foreignResidents.asOf}時点）。多様性・国際性の目安として、出入国在留管理庁「在留外国人統計」の実データで比較できます。`;
  };
}

export const RANKINGS: RankingDef[] = [
  {
    slug: "rent-cheap",
    title: "家賃が安い市区町村ランキング",
    shortLabel: "家賃が安い",
    description:
      "全国の市区町村を民営借家中央値が安い順にランキング。最も家賃が安いのは{top1}。家賃相場の低い自治体を政府統計（住宅・土地統計調査）の実データで比較できます。",
    lead: "全国の市区町村を民営借家中央値が安い順に並べたランキングです。",
    columnLabel: "家賃中央値",
    order: "asc",
    qualifies: (m) => hasRent(m.rent.value),
    sortValue: (m) => m.rent.value,
    display: (m) => `${m.rent.value.toLocaleString()}円/月`,
  },
  {
    slug: "rent-high",
    title: "家賃が高い市区町村ランキング",
    shortLabel: "家賃が高い",
    description:
      "全国の市区町村を民営借家中央値が高い順にランキング。最も家賃が高いのは{top1}。家賃相場の高い自治体を政府統計（住宅・土地統計調査）の実データで比較できます。",
    lead: "全国の市区町村を民営借家中央値が高い順に並べたランキングです。",
    columnLabel: "家賃中央値",
    order: "desc",
    qualifies: (m) => hasRent(m.rent.value),
    sortValue: (m) => m.rent.value,
    display: (m) => `${m.rent.value.toLocaleString()}円/月`,
  },
  {
    slug: "land-price-high",
    title: "地価が高い市区町村ランキング",
    shortLabel: "地価が高い",
    description:
      "全国の市区町村を住宅地の地価が高い順にランキング。最も地価が高いのは{top1}。地価公示・地価調査の実データで自治体を比較できます。",
    lead: "全国の市区町村を住宅地の地価（円/㎡）が高い順に並べたランキングです。",
    columnLabel: "地価（住宅地）",
    order: "desc",
    qualifies: (m) => hasLandPrice(m.landPrice.value),
    sortValue: (m) => m.landPrice.value,
    display: (m) => `${m.landPrice.value.toLocaleString()}円/㎡`,
  },
  {
    slug: "waitlist-zero",
    title: "待機児童ゼロの市区町村",
    shortLabel: "待機児童ゼロ",
    description:
      "待機児童ゼロの市区町村を人口が多い順に掲載。{top1}など、子育て世帯が注目する待機児童ゼロの自治体をこども家庭庁の公表値で確認できます。",
    lead: "待機児童数が0人の市区町村を、人口が多い順に掲載しています（こども家庭庁の公表値）。",
    columnLabel: "人口",
    order: "desc",
    qualifies: (m) => isWaitlistDisclosed(m.waitlistChildren) && m.waitlistChildren.value === 0,
    sortValue: (m) => m.population,
    display: (m) => `${m.population.toLocaleString()}人`,
  },
  {
    slug: "population-most",
    title: "人口が多い市区町村ランキング",
    shortLabel: "人口が多い",
    description:
      "全国の市区町村を人口が多い順にランキング。最も人口が多いのは{top1}。国勢調査の人口（実データ）で自治体規模を比較できます。",
    lead: "全国の市区町村を、人口が多い順に並べたランキングです（国勢調査）。",
    columnLabel: "人口",
    order: "desc",
    qualifies: (m) => m.population > 0,
    sortValue: (m) => m.population,
    display: (m) => `${m.population.toLocaleString()}人`,
  },
  {
    slug: "foreign-ratio-high",
    title: "外国人住民比率が高い市区町村ランキング",
    shortLabel: "外国人比率が高い",
    description:
      "全国の市区町村を外国人住民比率が高い順にランキング。多様性・国際性の目安として、出入国在留管理庁「在留外国人統計」の実データで比較できます。",
    metaDescription: foreignMetaDescription("高い"),
    lead: "全国の市区町村を、人口に占める外国人住民の割合が高い順に並べたランキングです。",
    note: FOREIGN_NOTE,
    intro: foreignIntro("高い"),
    faq: FOREIGN_FAQ,
    prefIntro: foreignPrefIntro("高い"),
    compareForeignAvg: true,
    freshnessLabel: foreignFreshnessLabel,
    columnLabel: "外国人住民比率",
    order: "desc",
    // 在留外国人統計の対象かつ人口が有効（比率を算出できる）自治体のみ。
    qualifies: (m) => hasForeignData(m.foreignResidents.source) && m.population > 0,
    sortValue: (m) => foreignRatioPct(m),
    display: (m) => `${foreignRatioPct(m).toFixed(2)}%`,
  },
  {
    slug: "foreign-ratio-low",
    title: "外国人住民比率が低い市区町村ランキング",
    shortLabel: "外国人比率が低い",
    description:
      "全国の市区町村を外国人住民比率が低い順にランキング。多様性・国際性の目安として、出入国在留管理庁「在留外国人統計」の実データで比較できます。",
    metaDescription: foreignMetaDescription("低い"),
    lead: "全国の市区町村を、人口に占める外国人住民の割合が低い順に並べたランキングです。",
    note: FOREIGN_NOTE,
    intro: foreignIntro("低い"),
    faq: FOREIGN_FAQ,
    prefIntro: foreignPrefIntro("低い"),
    compareForeignAvg: true,
    freshnessLabel: foreignFreshnessLabel,
    columnLabel: "外国人住民比率",
    order: "asc",
    qualifies: (m) => hasForeignData(m.foreignResidents.source) && m.population > 0,
    sortValue: (m) => foreignRatioPct(m),
    display: (m) => `${foreignRatioPct(m).toFixed(2)}%`,
  },
];

const BY_SLUG = new Map(RANKINGS.map((r) => [r.slug, r]));

export function getRankingBySlug(slug: string): RankingDef | null {
  return BY_SLUG.get(slug) ?? null;
}

/** 市区町村のみ（政令市の行政区を除外）。ランキングは market-level の1自治体1エントリ。 */
export function muniLevelOnly(all: Municipality[]): Municipality[] {
  return all.filter((m) => (m.level ?? "muni") !== "ward");
}

/** 定義に従って候補を抽出・整列して返す（limit 指定時は上位 limit 件）。 */
export function rankBy(def: RankingDef, munis: Municipality[], limit?: number): Municipality[] {
  const sorted = munis
    .filter(def.qualifies)
    .sort((a, b) =>
      def.order === "asc" ? def.sortValue(a) - def.sortValue(b) : def.sortValue(b) - def.sortValue(a),
    );
  return typeof limit === "number" ? sorted.slice(0, limit) : sorted;
}
