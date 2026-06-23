import Link from "next/link";
import type { Metadata } from "next";
import { listAllAcrossPrefs } from "@/lib/metrics";
import { RANKINGS, muniLevelOnly, rankBy } from "@/lib/rankings";
import { SITE, prefNameOf, absoluteUrl } from "@/lib/site";
import { jsonLdHtml } from "@/lib/jsonLd";

export function generateMetadata(): Metadata {
  const title = `住みやすさ・家賃ランキング一覧｜全国の市区町村を比較｜${SITE.name}`;
  const description = `家賃が安い／高い、地価が高い、待機児童ゼロなど、全国の市区町村を政府統計の実データで比較できるランキング一覧。${SITE.name}。`;
  const url = absoluteUrl("/ranking");
  const ogImage = absoluteUrl("/api/og");
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
      images: [{ url: ogImage, width: 1200, height: 630, alt: SITE.name }],
    },
    twitter: { card: "summary_large_image", title, description, images: [ogImage] },
  };
}

export default async function RankingIndexPage() {
  const munis = muniLevelOnly(await listAllAcrossPrefs());
  // 各ランキングの1位を添えて、一覧をリッチに（クロール用の内部リンクも厚くなる）
  const cards = RANKINGS.map((def) => {
    const top1 = rankBy(def, munis, 1)[0] ?? null;
    return { def, top1 };
  });

  const ldJson = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: SITE.name, item: absoluteUrl("/") },
          { "@type": "ListItem", position: 2, name: "ランキング", item: absoluteUrl("/ranking") },
        ],
      },
      {
        "@type": "ItemList",
        name: "住みやすさ・家賃ランキング一覧",
        numberOfItems: RANKINGS.length,
        itemListElement: RANKINGS.map((r, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: r.title,
          url: absoluteUrl(`/ranking/${r.slug}`),
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
        <span className="breadcrumb-current">ランキング</span>
      </nav>

      <header className="detail-hero">
        <h1 className="detail-title">
          住みやすさ・家賃ランキング
          <span className="detail-title-sub">全国の市区町村を比較</span>
        </h1>
        <p className="detail-lead">
          家賃・地価・子育てなどの指標で、全国の市区町村を政府統計の実データでランキング。気になる指標を選んでください。
        </p>
      </header>

      <section className="detail-section">
        <ul className="related-grid">
          {cards.map(({ def, top1 }) => (
            <li key={def.slug}>
              <Link href={`/ranking/${def.slug}`} className="related-card">
                <span className="related-name">{def.title}</span>
                {top1 && (
                  <span className="related-rent">
                    1位: {prefNameOf(top1.pref)}{top1.displayName ?? top1.name}（{def.display(top1)}）
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div style={{ marginTop: 28 }}>
        <Link href="/" className="detail-back">← 地図に戻る</Link>
      </div>
    </div>
  );
}
