import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMunicipality, listAll, listAllAcrossPrefs } from "@/lib/metrics";
import { buildSummary } from "@/lib/summary";
import { findRelatedByRent } from "@/lib/related";
import { RANKINGS } from "@/lib/rankings";
import { buildFaq } from "@/lib/faq";
import { SITE, prefNameOf, absoluteUrl } from "@/lib/site";
import { hasRent, rentBand } from "@/lib/rentColor";
import { isWaitlistDisclosed } from "@/lib/waitlist";
import { hasLandPrice } from "@/lib/landPrice";
import { isHazardEvaluated, isAmenitiesCounted, coverageReason } from "@/lib/coverage";
import type { Municipality } from "@/lib/types";

type Params = { pref: string; city: string };

export async function generateStaticParams() {
  const all = await listAllAcrossPrefs();
  return all.map((m) => ({ pref: m.pref, city: m.code }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const m = await getMunicipality(params.city);
  if (!m) return { title: "見つかりません | KurashiMap" };
  const prefName = prefNameOf(m.pref);
  const fullName = m.displayName ?? m.name;
  const pop = m.population.toLocaleString();
  const hasRentData = hasRent(m.rent.value);
  const rent = m.rent.value.toLocaleString();
  const title = hasRentData
    ? `${fullName}の住みやすさ — 家賃${rent}円/月｜${SITE.name}`
    : `${fullName}の住みやすさ｜${SITE.name}`;
  const rentPhrase = hasRentData ? `民営借家中央値${rent}円/月、` : "";
  const description = `${fullName}（${prefName}）の住みやすさを地図でチェック。${rentPhrase}人口${pop}人。地価・待機児童・災害リスクをまとめて比較できる${SITE.name}の自治体ページ。`;
  const url = absoluteUrl(`/area/${m.pref}/${m.code}`);
  const ogImage = absoluteUrl(`/api/og/${m.code}`);
  return {
    title,
    description,
    metadataBase: new URL(SITE.baseUrl),
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      locale: SITE.locale,
      url,
      title,
      description,
      siteName: SITE.name,
      images: [{ url: ogImage, width: 1200, height: 630, alt: `${m.name}の住みやすさサマリー` }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function AreaPage({ params }: { params: Params }) {
  const m = await getMunicipality(params.city);
  if (!m) notFound();

  const all = await listAll(m.pref);
  // 同じ階層（市区町村なら市区町村、区なら区）の中から類似自治体を選ぶ
  const peers = all.filter((x) => (x.level ?? "muni") === (m.level ?? "muni"));
  const related = findRelatedByRent(peers, m, 6);
  const prefName = prefNameOf(m.pref);
  const parent = m.parentCode ? all.find((x) => x.code === m.parentCode) ?? null : null;
  const heading = m.displayName ?? m.name;

  // 同県の主要自治体（人口の多い順）。自身と「家賃が近い」既出分を除いて回遊先を広げる。
  const excluded = new Set([m.code, ...related.map((r) => r.code)]);
  const majorPeers = peers
    .filter((x) => !excluded.has(x.code))
    .sort((a, b) => b.population - a.population)
    .slice(0, 6);
  // 行政区ページなら同じ政令市の他の区（兄弟区）へのリンクを張る。
  const siblings =
    m.level === "ward" && m.parentCode
      ? all.filter((x) => x.level === "ward" && x.parentCode === m.parentCode && x.code !== m.code)
      : [];

  const breadcrumbItems: Array<{ name: string; item: string }> = [
    { name: SITE.name, item: absoluteUrl("/") },
    { name: prefName, item: absoluteUrl(`/area/${m.pref}`) },
  ];
  if (parent) {
    breadcrumbItems.push({ name: parent.name, item: absoluteUrl(`/area/${parent.pref}/${parent.code}`) });
  }
  breadcrumbItems.push({ name: m.name, item: absoluteUrl(`/area/${m.pref}/${m.code}`) });

  // よくある質問（可視テキストと FAQPage 構造化データで同じソースを共有）
  const faq = buildFaq(m, prefName);

  const ldJson = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: breadcrumbItems.map((b, i) => ({
          "@type": "ListItem", position: i + 1, name: b.name, item: b.item,
        })),
      },
      {
        "@type": "AdministrativeArea",
        name: heading,
        addressCountry: "JP",
        containedInPlace: parent
          ? { "@type": "AdministrativeArea", name: parent.name, containedInPlace: { "@type": "AdministrativeArea", name: prefName } }
          : { "@type": "AdministrativeArea", name: prefName },
        identifier: m.code,
        url: absoluteUrl(`/area/${m.pref}/${m.code}`),
      },
      {
        "@type": "FAQPage",
        mainEntity: faq.map(({ q, a }) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      },
    ],
  };

  return (
    <div className="detail-root">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ldJson) }}
      />

      <nav aria-label="パンくず" className="breadcrumb">
        <Link href="/" className="breadcrumb-link">{SITE.name}</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/area/${m.pref}`} className="breadcrumb-link">{prefName}</Link>
        {parent && (
          <>
            <span aria-hidden="true">/</span>
            <Link href={`/area/${parent.pref}/${parent.code}`} className="breadcrumb-link">{parent.name}</Link>
          </>
        )}
        <span aria-hidden="true">/</span>
        <span className="breadcrumb-current">{m.name}</span>
      </nav>

      <header className="detail-hero">
        <h1 className="detail-title">
          {heading}
          <span className="detail-title-sub">の住みやすさ</span>
        </h1>
        <p className="detail-lead">{buildSummary(m)}</p>
        <ul className="hero-stats">
          <HeroStat label="家賃中央値" value={hasRent(m.rent.value) ? `${m.rent.value.toLocaleString()}円/月` : "データなし"} highlight />
          <HeroStat label="人口" value={`${m.population.toLocaleString()}人`} sub={m.populationTrend} />
          <HeroStat label="地価" value={hasLandPrice(m.landPrice.value) ? `${m.landPrice.value.toLocaleString()}円/㎡` : "データなし"} />
          <HeroStat label="待機児童" value={isWaitlistDisclosed(m.waitlistChildren) ? `${m.waitlistChildren.value}人` : "データなし"} />
        </ul>
      </header>

      <section className="detail-section">
        <h2 className="detail-h2">家賃・住居コスト</h2>
        <p className="detail-p">
          {hasRent(m.rent.value) ? (
            <>
              {m.name}の民営借家中央値は <strong>{m.rent.value.toLocaleString()}円/月</strong>。
              {prefName}全体の中で見ると、家賃水準は{rentBand(m.rent.value)}に位置します。
            </>
          ) : (
            <>
              {m.name}の民営借家中央値は<strong>データなし</strong>です（住宅統計の集計対象外）。
            </>
          )}
          地価（住宅地）は{" "}
          {hasLandPrice(m.landPrice.value) ? (
            <><strong>{m.landPrice.value.toLocaleString()}円/㎡</strong> です。</>
          ) : (
            <><strong>データなし</strong>です（{coverageReason(m.landPrice.source)}）。</>
          )}
        </p>
        {hasRent(m.rent.value) && (
          <SourceLine source={m.rent.source} asOf={m.rent.asOf} estimated={m.rent.isEstimated} />
        )}
      </section>

      <section className="detail-section">
        <h2 className="detail-h2">子育て環境</h2>
        <p className="detail-p">
          {isWaitlistDisclosed(m.waitlistChildren) ? (
            <>
              待機児童数は <strong>{m.waitlistChildren.value}人</strong>
              {m.waitlistChildren.value === 0 ? "（待機児童ゼロ）" : ""}。
            </>
          ) : (
            <>待機児童数は<strong>区別の公表なし</strong>（{m.waitlistChildren.source.replace("区別非公表（", "").replace(/）.*$/, "")}）。</>
          )}
          人口は <strong>{m.population.toLocaleString()}人</strong>（{m.populationTrend}傾向）。
        </p>
        <SourceLine source={m.waitlistChildren.source} asOf={m.waitlistChildren.asOf} estimated={m.waitlistChildren.isEstimated} />
        <p className="detail-source-line" style={{ marginTop: 4 }}>人口は令和7年(2025)国勢調査 速報</p>
      </section>

      <section className="detail-section">
        <h2 className="detail-h2">災害リスク</h2>
        {isHazardEvaluated(m.hazard.source) ? (
          <p className="detail-p">
            浸水想定区域: <strong>{m.hazard.hasFloodRisk ? "あり" : "なし"}</strong>
            {" / "}
            土砂災害警戒区域: <strong>{m.hazard.hasLandslideRisk ? "あり" : "なし"}</strong>
          </p>
        ) : (
          <p className="detail-p">ハザード評価は<strong>対象外</strong>です（{coverageReason(m.hazard.source)}）。</p>
        )}
        {m.hazard.note && <p className="detail-note">{m.hazard.note}</p>}
        <SourceLine source={m.hazard.source} asOf={m.hazard.asOf} />
      </section>

      {m.amenities && (
        <section className="detail-section">
          <h2 className="detail-h2">生活インフラ</h2>
          {isAmenitiesCounted(m.amenities.source) ? (
            <ul className="hero-stats" style={{ marginTop: 6 }}>
              <HeroStat label="駅数" value={`${m.amenities.stations}`} />
              <HeroStat label="保育・幼稚園" value={`${m.amenities.preschools}`} />
              <HeroStat label="医療機関" value={`${m.amenities.medicalFacilities}`} />
            </ul>
          ) : (
            <p className="detail-p">集計<strong>対象外</strong>です（{coverageReason(m.amenities.source)}）。</p>
          )}
          <p className="detail-source-line" style={{ marginTop: 10 }}>
            出典: {m.amenities.source}（{m.amenities.asOf}）
          </p>
        </section>
      )}

      <section className="detail-section">
        <h2 className="detail-h2">家賃水準が近い自治体</h2>
        <p className="detail-p" style={{ color: "var(--text-muted)", fontSize: 13.5 }}>
          {m.name}と家賃中央値が近い{prefName}の自治体です。
        </p>
        <ul className="related-grid">
          {related.map((r) => (
            <li key={r.code}>
              <Link href={`/area/${r.pref}/${r.code}`} className="related-card">
                <span className="related-name">{r.name}</span>
                <span className="related-rent">{hasRent(r.rent.value) ? `${r.rent.value.toLocaleString()} 円/月` : "データなし"}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {siblings.length > 0 && parent && (
        <section className="detail-section">
          <h2 className="detail-h2">{parent.name}のほかの区</h2>
          <ul className="related-grid">
            {siblings.map((s) => (
              <li key={s.code}>
                <Link href={`/area/${s.pref}/${s.code}`} className="related-card">
                  <span className="related-name">{s.name}</span>
                  <span className="related-rent">{hasRent(s.rent.value) ? `${s.rent.value.toLocaleString()} 円/月` : "データなし"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {majorPeers.length > 0 && (
        <section className="detail-section">
          <h2 className="detail-h2">{prefName}の主要自治体</h2>
          <p className="detail-p" style={{ color: "var(--text-muted)", fontSize: 13.5 }}>
            {prefName}で人口の多い自治体です。
            <Link href={`/area/${m.pref}`} className="breadcrumb-link" style={{ marginLeft: 6 }}>
              全{prefName}の一覧を見る →
            </Link>
          </p>
          <ul className="related-grid">
            {majorPeers.map((p) => (
              <li key={p.code}>
                <Link href={`/area/${p.pref}/${p.code}`} className="related-card">
                  <span className="related-name">{p.displayName ?? p.name}</span>
                  <span className="related-rent">人口 {p.population.toLocaleString()}人</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="detail-section">
        <h2 className="detail-h2">ランキングで比較</h2>
        <ul className="related-grid">
          {RANKINGS.map((r) => (
            <li key={r.slug}>
              <Link href={`/ranking/${r.slug}`} className="related-card">
                <span className="related-name">{r.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="detail-section">
        <h2 className="detail-h2">{m.name}のよくある質問</h2>
        <dl className="faq-list">
          {faq.map(({ q, a }, i) => (
            <div key={i} className="faq-item">
              <dt className="faq-q">{q}</dt>
              <dd className="faq-a">{a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="detail-section">
        <h2 className="detail-h2">出典・データについて</h2>
        <p className="detail-p" style={{ fontSize: 13, color: "var(--text-muted)" }}>
          本ページの数値は政府統計・国土数値情報の実データです。家賃は住宅・土地統計調査、人口は国勢調査（ともに e-Stat 経由）、地価は地価公示・地価調査、ハザード・生活インフラは不動産情報ライブラリ（reinfolib）／国土数値情報、待機児童はこども家庭庁の公表値に基づきます。データのない項目は推計で埋めず「データなし／対象外」と明示しています。
        </p>
      </section>

      <div style={{ marginTop: 28, display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Link href={`/area/${m.pref}`} className="detail-back">← {prefName}の一覧</Link>
        <Link href="/ranking" className="detail-back">ランキング</Link>
        <Link href="/" className="detail-back">地図に戻る</Link>
      </div>
    </div>
  );
}

function HeroStat({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <li className={`hero-stat ${highlight ? "is-highlight" : ""}`}>
      <span className="hero-stat-label">{label}</span>
      <span className="hero-stat-value">{value}</span>
      {sub && <span className="hero-stat-sub">{sub}</span>}
    </li>
  );
}

function SourceLine({ source, asOf, estimated }: { source: string; asOf: string; estimated?: boolean }) {
  return (
    <p className="detail-source-line">
      出典: {source}（{asOf}）
      {estimated && <span className="metric-est">推計</span>}
    </p>
  );
}
