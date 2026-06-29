import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listMunicipalities } from "@/lib/metrics";
import { RANKINGS, getRankingBySlug, rankBy, type RankingDef } from "@/lib/rankings";
import { PREFS, getPrefBySlug } from "@/lib/prefs";
import { SITE, absoluteUrl } from "@/lib/site";
import { getForeignStats } from "@/lib/foreignStats";
import type { Municipality } from "@/lib/types";

type Params = { metric: string; pref: string };

const TOP_CARDS = 10;

// 県 × 指標の総当たりのうち、対象データが1件以上ある組み合わせだけを生成する
// （0件のページは作らない＝薄いページを避ける）。
export async function generateStaticParams() {
  const params: Params[] = [];
  for (const p of PREFS) {
    const munis = await listMunicipalities(p.slug);
    for (const r of RANKINGS) {
      if (rankBy(r, munis, 1).length > 0) params.push({ metric: r.slug, pref: p.slug });
    }
  }
  return params;
}

// listMunicipalities は data/{slug}.json（市区町村）のみを返し、政令市の行政区
// （_wards.json）は含まない。東京特別区は muni 扱いで含まれるため、これは
// rankings の muniLevelOnly と同じ「1自治体1エントリ」になる。
async function rankedFor(def: RankingDef, prefSlug: string): Promise<Municipality[]> {
  return rankBy(def, await listMunicipalities(prefSlug));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const def = getRankingBySlug(params.metric);
  const pref = getPrefBySlug(params.pref);
  if (!def || !pref) return { title: "見つかりません | KurashiMap" };
  const ranked = await rankedFor(def, params.pref);
  const top1 = ranked[0] ? (ranked[0].displayName ?? ranked[0].name) : "—";
  const freshness = def.freshnessLabel?.(ranked[0] ?? null) ?? null;
  const fresh = freshness ? `【${freshness}】` : "";
  const title = `${pref.nameJa}の${def.title}${fresh}｜市区町村を比較｜${SITE.name}`;
  const description = `${pref.nameJa}の${def.title}。1位は${top1}。${pref.nameJa}内の${ranked.length}市区町村を政府統計の実データで比較できる${SITE.name}。`;
  const url = absoluteUrl(`/ranking/${def.slug}/${pref.slug}`);
  const ogImage = absoluteUrl(`/api/og/ranking/${def.slug}`);
  return {
    title,
    description,
    metadataBase: new URL(SITE.baseUrl),
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      locale: SITE.locale,
      url,
      title,
      description,
      siteName: SITE.name,
      images: [{ url: ogImage, width: 1200, height: 630, alt: `${pref.nameJa}の${def.title}` }],
    },
    twitter: { card: "summary_large_image", title, description, images: [ogImage] },
  };
}

export default async function PrefRankingPage({ params }: { params: Params }) {
  const def = getRankingBySlug(params.metric);
  const pref = getPrefBySlug(params.pref);
  if (!def || !pref) notFound();

  const munis = await listMunicipalities(params.pref);
  const ranked = rankBy(def, munis);
  if (ranked.length === 0) notFound();
  const cards = ranked.slice(0, TOP_CARDS);
  const prefName = pref.nameJa;

  // データ鮮度ラベル・導入文・FAQ（定義のある指標のみ）。
  const freshness = def.freshnessLabel?.(ranked[0] ?? null) ?? null;
  const headingSub = freshness ? `【${freshness}】` : null;
  const intro = def.prefIntro?.(prefName) ?? [];
  const faq = def.faq ?? [];

  // 外国人住民比率ランキングのベンチマーク（県平均・全国平均）。すべて実データ由来。
  // fc は県平均・全国平均が定数なので、ランキング先頭自治体の集計値から1件取得すれば足りる。
  let benchmark: { prefAvg: number; nationalAvg: number } | null = null;
  if (def.compareForeignAvg) {
    const fc = (await getForeignStats()).get(ranked[0].code);
    if (fc) benchmark = { prefAvg: fc.prefAvg, nationalAvg: fc.nationalAvg };
  }

  // 同じ県の「ほかの指標」リンク（データのある指標のみ）
  const otherMetrics = RANKINGS.filter(
    (r) => r.slug !== def.slug && rankBy(r, munis, 1).length > 0,
  );

  const ldJson = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: SITE.name, item: absoluteUrl("/") },
          { "@type": "ListItem", position: 2, name: "ランキング", item: absoluteUrl("/ranking") },
          { "@type": "ListItem", position: 3, name: def.title, item: absoluteUrl(`/ranking/${def.slug}`) },
          { "@type": "ListItem", position: 4, name: prefName, item: absoluteUrl(`/ranking/${def.slug}/${pref.slug}`) },
        ],
      },
      {
        "@type": "ItemList",
        name: `${prefName}の${def.title}`,
        numberOfItems: ranked.length,
        itemListElement: ranked.map((m, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: m.displayName ?? m.name,
          url: absoluteUrl(`/area/${m.pref}/${m.code}`),
        })),
      },
      ...(faq.length > 0
        ? [
            {
              "@type": "FAQPage",
              mainEntity: faq.map(({ q, a }) => ({
                "@type": "Question",
                name: q,
                acceptedAnswer: { "@type": "Answer", text: a },
              })),
            },
          ]
        : []),
    ],
  };

  return (
    <div className="detail-root">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ldJson) }} />

      <nav aria-label="パンくず" className="breadcrumb">
        <Link href="/" className="breadcrumb-link">{SITE.name}</Link>
        <span aria-hidden="true">/</span>
        <Link href="/ranking" className="breadcrumb-link">ランキング</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/ranking/${def.slug}`} className="breadcrumb-link">{def.shortLabel}</Link>
        <span aria-hidden="true">/</span>
        <span className="breadcrumb-current">{prefName}</span>
      </nav>

      <header className="detail-hero">
        <h1 className="detail-title">
          {prefName}の{def.title}
          {headingSub && <span className="detail-title-sub">{headingSub}</span>}
        </h1>
        <p className="detail-lead">
          {def.lead.replace("全国の", `${prefName}の`)}データのある{ranked.length}市区町村を、政府統計の実データで集計しています（推計値は含みません）。
        </p>
        {def.note && <p className="detail-note">{def.note}</p>}
        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href={`/ranking/${def.slug}`} className="related-card" style={{ display: "inline-flex", width: "auto", padding: "8px 14px" }}>
            <span className="related-name">📊 全国版を見る</span>
          </Link>
          <Link href={`/area/${pref.slug}`} className="related-card" style={{ display: "inline-flex", width: "auto", padding: "8px 14px" }}>
            <span className="related-name">🗾 {prefName}の全自治体</span>
          </Link>
        </div>
      </header>

      {intro.length > 0 && (
        <section className="detail-section">
          {intro.map((p, i) => (
            <p key={i} className="detail-p">{p}</p>
          ))}
        </section>
      )}

      {benchmark && (
        <section className="detail-section">
          <h2 className="detail-h2">ベンチマーク（平均との比較）</h2>
          <ul className="mini-cards cols-2">
            <li className="mini-card">
              <div className="mini-card-label">{prefName}平均</div>
              <div className="mini-card-value">{benchmark.prefAvg.toFixed(2)}<span className="unit"> %</span></div>
              <p className="mini-card-sub">{prefName}内 全市区町村の加重平均</p>
            </li>
            <li className="mini-card">
              <div className="mini-card-label">全国平均</div>
              <div className="mini-card-value">{benchmark.nationalAvg.toFixed(2)}<span className="unit"> %</span></div>
              <p className="mini-card-sub">全国 全市区町村の加重平均</p>
            </li>
          </ul>
        </section>
      )}

      <section className="detail-section">
        <h2 className="detail-h2">トップ{cards.length}</h2>
        <ol className="pref-rank">
          {cards.map((m, i) => (
            <li key={m.code}>
              <Link href={`/area/${m.pref}/${m.code}`} className="pref-rank-item">
                <span className="pref-rank-no">{i + 1}</span>
                <span className="pref-rank-name">{m.displayName ?? m.name}</span>
                <span className="pref-rank-value">{def.display(m)}</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="detail-section">
        <h2 className="detail-h2">{prefName}の全ランキング（{ranked.length}自治体）</h2>
        <div className="pref-table-wrap">
          <table className="pref-table">
            <thead>
              <tr>
                <th scope="col" className="num">順位</th>
                <th scope="col">自治体</th>
                <th scope="col" className="num">{def.columnLabel}</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((m, i) => (
                <tr key={m.code}>
                  <td className="num">{i + 1}</td>
                  <th scope="row">
                    <Link href={`/area/${m.pref}/${m.code}`} className="pref-table-link">
                      {m.displayName ?? m.name}
                    </Link>
                  </th>
                  <td className="num">{def.display(m)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {otherMetrics.length > 0 && (
        <section className="detail-section">
          <h2 className="detail-h2">{prefName}のほかのランキング</h2>
          <ul className="related-grid">
            {otherMetrics.map((r) => (
              <li key={r.slug}>
                <Link href={`/ranking/${r.slug}/${pref.slug}`} className="related-card">
                  <span className="related-name">{prefName}の{r.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {faq.length > 0 && (
        <section className="detail-section">
          <h2 className="detail-h2">よくある質問</h2>
          <dl className="faq-list">
            {faq.map(({ q, a }, i) => (
              <div key={i} className="faq-item">
                <dt className="faq-q">{q}</dt>
                <dd className="faq-a">{a}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="detail-section">
        <h2 className="detail-h2">出典・データについて</h2>
        <p className="detail-p" style={{ fontSize: 13, color: "var(--text-muted)" }}>
          家賃は住宅・土地統計調査、地価は地価公示・地価調査、待機児童はこども家庭庁の公表値、人口は国勢調査、外国人住民比率は出入国在留管理庁「在留外国人統計」に基づきます（e-Stat ほか）。政令指定都市の行政区は親市との重複を避けるため集計から除外しています。データのない自治体はランキングの対象外です。
        </p>
      </section>

      <div style={{ marginTop: 28, display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Link href={`/ranking/${def.slug}`} className="detail-back">← 全国版</Link>
        <Link href="/ranking" className="detail-back">ランキング一覧</Link>
        <Link href={`/area/${pref.slug}`} className="detail-back">{prefName}の一覧</Link>
      </div>
    </div>
  );
}
