import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listAllAcrossPrefs } from "@/lib/metrics";
import { RANKINGS, getRankingBySlug, muniLevelOnly, rankBy, type RankingDef } from "@/lib/rankings";
import { PREFS } from "@/lib/prefs";
import { SITE, prefNameOf, absoluteUrl } from "@/lib/site";
import { jsonLdHtml } from "@/lib/jsonLd";

type Params = { metric: string };

// 上位何件まで掲載するか（カード=10、テーブル=100）。
const TOP_CARDS = 10;
const TOP_TABLE = 100;

export function generateStaticParams() {
  return RANKINGS.map((r) => ({ metric: r.slug }));
}

async function rankedFor(def: RankingDef, limit: number) {
  const munis = muniLevelOnly(await listAllAcrossPrefs());
  return rankBy(def, munis, limit);
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const def = getRankingBySlug(params.metric);
  if (!def) return { title: "見つかりません | KurashiMap" };
  const top = await rankedFor(def, 1);
  const top1 = top[0] ? `${prefNameOf(top[0].pref)}${top[0].displayName ?? top[0].name}` : "—";
  const title = `${def.title}【全国】｜${SITE.name}`;
  const description = def.description.replace("{top1}", top1);
  const url = absoluteUrl(`/ranking/${def.slug}`);
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
      images: [{ url: ogImage, width: 1200, height: 630, alt: def.title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [ogImage] },
  };
}

export default async function RankingPage({ params }: { params: Params }) {
  const def = getRankingBySlug(params.metric);
  if (!def) notFound();

  const allMunis = muniLevelOnly(await listAllAcrossPrefs());
  const ranked = rankBy(def, allMunis, TOP_TABLE);
  if (ranked.length === 0) notFound();
  const cards = ranked.slice(0, TOP_CARDS);

  const others = RANKINGS.filter((r) => r.slug !== def.slug);
  // この指標に該当データがある都道府県（県別ランキングへの導線）
  const prefsWithData = PREFS.filter((p) => allMunis.some((m) => m.pref === p.slug && def.qualifies(m)));

  const ldJson = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: SITE.name, item: absoluteUrl("/") },
          { "@type": "ListItem", position: 2, name: "ランキング", item: absoluteUrl("/ranking") },
          { "@type": "ListItem", position: 3, name: def.title, item: absoluteUrl(`/ranking/${def.slug}`) },
        ],
      },
      {
        "@type": "ItemList",
        name: `${def.title}【全国】`,
        numberOfItems: ranked.length,
        itemListElement: ranked.map((m, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: `${prefNameOf(m.pref)}${m.displayName ?? m.name}`,
          url: absoluteUrl(`/area/${m.pref}/${m.code}`),
        })),
      },
    ],
  };

  return (
    <div className="detail-root">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(ldJson) }} />

      <nav aria-label="パンくず" className="breadcrumb">
        <Link href="/" className="breadcrumb-link">{SITE.name}</Link>
        <span aria-hidden="true">/</span>
        <Link href="/ranking" className="breadcrumb-link">ランキング</Link>
        <span aria-hidden="true">/</span>
        <span className="breadcrumb-current">{def.shortLabel}</span>
      </nav>

      <header className="detail-hero">
        <h1 className="detail-title">
          {def.title}
          <span className="detail-title-sub">【全国】</span>
        </h1>
        <p className="detail-lead">
          {def.lead}データのある自治体のみを対象に、政府統計の実データで集計しています（推計値は含みません）。
        </p>
      </header>

      <section className="detail-section">
        <h2 className="detail-h2">トップ{cards.length}</h2>
        <ol className="pref-rank">
          {cards.map((m, i) => (
            <li key={m.code}>
              <Link href={`/area/${m.pref}/${m.code}`} className="pref-rank-item">
                <span className="pref-rank-no">{i + 1}</span>
                <span className="pref-rank-name">
                  {m.displayName ?? m.name}
                  <span className="pref-rank-pref">{prefNameOf(m.pref)}</span>
                </span>
                <span className="pref-rank-value">{def.display(m)}</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="detail-section">
        <h2 className="detail-h2">全国ランキング（上位{ranked.length}）</h2>
        <div className="pref-table-wrap">
          <table className="pref-table">
            <thead>
              <tr>
                <th scope="col" className="num">順位</th>
                <th scope="col">自治体</th>
                <th scope="col">都道府県</th>
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
                  <td>
                    <Link href={`/area/${m.pref}`} className="pref-table-link" style={{ fontWeight: 500 }}>
                      {prefNameOf(m.pref)}
                    </Link>
                  </td>
                  <td className="num">{def.display(m)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {prefsWithData.length > 0 && (
        <section className="detail-section">
          <h2 className="detail-h2">都道府県別に見る</h2>
          <p className="detail-p" style={{ color: "var(--text-muted)", fontSize: 13.5 }}>
            {def.title}を都道府県ごとに絞り込めます。
          </p>
          <ul className="pref-chip-grid">
            {prefsWithData.map((p) => (
              <li key={p.slug}>
                <Link href={`/ranking/${def.slug}/${p.slug}`} className="pref-chip">
                  {p.nameJa}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="detail-section">
        <h2 className="detail-h2">ほかのランキング</h2>
        <ul className="related-grid">
          {others.map((r) => (
            <li key={r.slug}>
              <Link href={`/ranking/${r.slug}`} className="related-card">
                <span className="related-name">{r.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="detail-section">
        <h2 className="detail-h2">出典・データについて</h2>
        <p className="detail-p" style={{ fontSize: 13, color: "var(--text-muted)" }}>
          家賃は住宅・土地統計調査、地価は地価公示・地価調査、待機児童はこども家庭庁の公表値、人口は国勢調査に基づきます（e-Stat ほか）。政令指定都市の行政区は親市との重複を避けるため集計から除外しています。データのない自治体はランキングの対象外です。
        </p>
      </section>

      <div style={{ marginTop: 28, display: "flex", gap: 12 }}>
        <Link href="/ranking" className="detail-back">← ランキング一覧</Link>
        <Link href="/" className="detail-back">地図に戻る</Link>
      </div>
    </div>
  );
}
