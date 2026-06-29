// ピラーページ /map/foreign-ratio。「外国人 割合 地図」「在留外国人 ヒートマップ」
// 「外国人 多い 地域 地図」の検索意図（=地図で見る）を獲得するハブ。全国コロプレスを
// 初期表示し、都道府県別ランキング・全国ランキング・自治体ページへ放射状に内部リンクする。
//
// 中立性: 在留外国人比率は多様性・国際性の客観指標として中立に提示（評価・誘導表現なし）。
// honesty: 数値はすべて実データ（出入国在留管理庁「在留外国人統計」＋国勢調査人口）。

import Link from "next/link";
import type { Metadata } from "next";
import ReactDOM from "react-dom";
import HomeShell from "@/components/HomeShell";
import { listSummaryAcrossPrefs, listAllAcrossPrefs } from "@/lib/metrics";
import { getRankingBySlug, rankBy, muniLevelOnly, formatAsOfJa } from "@/lib/rankings";
import { foreignRatioPct } from "@/lib/foreignResidents";
import { PREFS } from "@/lib/prefs";
import { SITE, prefNameOf, absoluteUrl } from "@/lib/site";
import type { Municipality } from "@/lib/types";

const PATH = "/map/foreign-ratio";
const OG = absoluteUrl("/api/og/ranking/foreign-ratio-high");

// 高い順・低い順の定義は lib/rankings.ts の単一ソースを参照（重複定義を避ける）。
const HIGH = getRankingBySlug("foreign-ratio-high")!;
const LOW = getRankingBySlug("foreign-ratio-low")!;

async function loadHub() {
  const all = muniLevelOnly(await listAllAcrossPrefs());
  const high = rankBy(HIGH, all, 12);
  const low = rankBy(LOW, all, 8);
  const prefsWithData = PREFS.filter((p) => all.some((m) => m.pref === p.slug && HIGH.qualifies(m)));
  const asOf = high[0]?.foreignResidents.asOf ?? "";
  return { high, low, prefsWithData, asOf };
}

export async function generateMetadata(): Promise<Metadata> {
  const { asOf } = await loadHub();
  const asOfJa = formatAsOfJa(asOf);
  const title = `外国人住民の割合を地図で見る｜在留外国人ヒートマップ - ${SITE.name}`;
  const description = `全国1,918市区町村の在留外国人の割合（％）を色分けした地図（コロプレス）。外国人が多い地域・少ない地域を視覚的に比較できます。都道府県別・ランキングへも展開。出典: 出入国在留管理庁「在留外国人統計」${asOfJa ? `（${asOfJa}）` : ""}。`;
  return {
    title,
    description,
    metadataBase: new URL(SITE.baseUrl),
    alternates: { canonical: PATH },
    openGraph: {
      type: "website",
      locale: SITE.locale,
      url: absoluteUrl(PATH),
      title,
      description,
      siteName: SITE.name,
      images: [{ url: OG, width: 1200, height: 630, alt: "在留外国人の割合マップ" }],
    },
    twitter: { card: "summary_large_image", title, description, images: [OG] },
  };
}

export default async function ForeignRatioMapPage() {
  // 地図の基盤タイルへ早期接続（ホームと同じリソースヒント）。
  ReactDOM.preconnect("https://tiles.openfreemap.org", { crossOrigin: "anonymous" });

  const summary = await listSummaryAcrossPrefs();
  const { high, low, prefsWithData, asOf } = await loadHub();
  const asOfJa = formatAsOfJa(asOf);

  const ldJson = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: SITE.name, item: absoluteUrl("/") },
          { "@type": "ListItem", position: 2, name: "外国人住民の割合マップ", item: absoluteUrl(PATH) },
        ],
      },
      {
        "@type": "Dataset",
        name: "市区町村別 在留外国人の割合（コロプレスマップ）",
        description:
          "全国1,918市区町村の在留外国人数と国勢調査人口から算出した、人口に占める外国人住民の割合（％）のデータセット。地図上で色分け（コロプレス）して比較できる。推計値は含まない。",
        url: absoluteUrl(PATH),
        keywords: ["外国人", "在留外国人", "割合", "比率", "地図", "ヒートマップ", "コロプレス", "市区町村"],
        isAccessibleForFree: true,
        creator: { "@type": "Organization", name: SITE.name, url: SITE.baseUrl },
        includedInDataCatalog: { "@type": "DataCatalog", name: "e-Stat 政府統計の総合窓口", url: "https://www.e-stat.go.jp/" },
        spatialCoverage: { "@type": "Place", name: "日本" },
        ...(asOf ? { temporalCoverage: asOf } : {}),
      },
    ],
  };

  return (
    <main className="home-main">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ldJson) }} />
      <HomeShell summary={summary} initialMetric="foreignRatio" navLabel="外国人住民の割合の地図から探す">
        <ForeignRatioHub high={high} low={low} prefsWithData={prefsWithData} asOfJa={asOfJa} />
      </HomeShell>
    </main>
  );
}

function ForeignRatioHub({
  high,
  low,
  prefsWithData,
  asOfJa,
}: {
  high: Municipality[];
  low: Municipality[];
  prefsWithData: typeof PREFS;
  asOfJa: string;
}) {
  return (
    <div className="home-links-inner">
      <h1 className="home-links-lead-title">外国人住民の割合を地図で見る</h1>
      <p className="home-links-lead">
        全国1,918市区町村の在留外国人の割合（人口に占める外国人住民の割合・％）を、色の濃淡で表したコロプレスマップです。色が濃い地域ほど割合が高く、外国人住民が多い地域・少ない地域をひと目で比較できます。地図の自治体をクリックすると、その街の在留外国人数・人口・人口推移などの住環境データを確認できます。
      </p>
      <p className="home-links-lead">
        外国人住民の割合は、地域の多様性・国際性を読み解く客観的な指標のひとつです。比率の高い・低いという事実を示すもので、住みやすさや治安などの価値判断とは無関係です。数値は出入国在留管理庁「在留外国人統計」{asOfJa && `（${asOfJa}）`}と国勢調査人口の実データから算出しており、推計値は含みません。
      </p>

      <section className="home-links-block">
        <h2 className="home-links-h">ランキングで比較</h2>
        <ul className="home-chip-row">
          <li><Link href="/ranking/foreign-ratio-high" className="home-chip">外国人住民比率が高い市区町村</Link></li>
          <li><Link href="/ranking/foreign-ratio-low" className="home-chip">外国人住民比率が低い市区町村</Link></li>
        </ul>
      </section>

      {high.length > 0 && (
        <section className="home-links-block">
          <h2 className="home-links-h">外国人住民の割合が高い市区町村</h2>
          <ul className="home-chip-row">
            {high.map((m) => (
              <li key={m.code}>
                <Link href={`/area/${m.pref}/${m.code}`} className="home-chip">
                  {prefNameOf(m.pref)}{m.displayName ?? m.name}（{foreignRatioPct(m).toFixed(1)}%）
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {low.length > 0 && (
        <section className="home-links-block">
          <h2 className="home-links-h">外国人住民の割合が低い市区町村</h2>
          <ul className="home-chip-row">
            {low.map((m) => (
              <li key={m.code}>
                <Link href={`/area/${m.pref}/${m.code}`} className="home-chip">
                  {prefNameOf(m.pref)}{m.displayName ?? m.name}（{foreignRatioPct(m).toFixed(1)}%）
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="home-links-block">
        <h2 className="home-links-h">都道府県別に見る</h2>
        <ul className="home-pref-grid">
          {prefsWithData.map((p) => (
            <li key={p.slug}>
              <Link href={`/ranking/foreign-ratio-high/${p.slug}`} className="home-pref-link">{p.nameJa}</Link>
            </li>
          ))}
        </ul>
      </section>

      <p className="home-links-foot">
        © KurashiMap — 出典: 出入国在留管理庁 在留外国人統計（e-Stat）・総務省 国勢調査。在留外国人の割合は多様性・国際性の目安として中立に提示しています。
      </p>
    </div>
  );
}
