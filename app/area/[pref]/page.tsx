import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listMunicipalities, listAll } from "@/lib/metrics";
import { PREFS, getPrefBySlug } from "@/lib/prefs";
import { SITE, absoluteUrl } from "@/lib/site";
import { hasRent, rentBand } from "@/lib/rentColor";
import { hasLandPrice } from "@/lib/landPrice";
import { isWaitlistDisclosed } from "@/lib/waitlist";
import type { Municipality } from "@/lib/types";

type Params = { pref: string };

export function generateStaticParams() {
  return PREFS.map((p) => ({ pref: p.slug }));
}

/** 整数配列の中央値（偶数長は平均を四捨五入）。空なら 0。 */
function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** 県の市区町村から集計指標を出す（メタデータと本文で共有）。 */
function prefStats(muni: Municipality[]) {
  const rents = muni.map((m) => m.rent.value).filter(hasRent);
  const waitlistZero = muni.filter(
    (m) => isWaitlistDisclosed(m.waitlistChildren) && m.waitlistChildren.value === 0,
  ).length;
  const floodCount = muni.filter((m) => m.hazard.hasFloodRisk).length;
  return {
    count: muni.length,
    rentMedian: median(rents),
    rentMin: rents.length ? Math.min(...rents) : 0,
    rentMax: rents.length ? Math.max(...rents) : 0,
    waitlistZero,
    floodCount,
  };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const pref = getPrefBySlug(params.pref);
  if (!pref) return { title: "見つかりません | KurashiMap" };
  const muni = await listMunicipalities(params.pref);
  const { count, rentMedian } = prefStats(muni);
  const medPhrase = rentMedian > 0 ? `家賃中央値${rentMedian.toLocaleString()}円/月、` : "";
  const title = `${pref.nameJa}の住みやすさ・家賃相場ランキング｜${count}市区町村を比較｜${SITE.name}`;
  const description = `${pref.nameJa}の全${count}市区町村の${medPhrase}地価・人口・待機児童・災害リスク・外国人比率を一覧で比較。家賃が安い自治体ランキングや子育て環境を、政府統計の実データでチェックできる${SITE.name}の都道府県ページ。`;
  const url = absoluteUrl(`/area/${pref.slug}`);
  const ogImage = absoluteUrl(`/api/og/pref/${pref.slug}`);
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
      images: [{ url: ogImage, width: 1200, height: 630, alt: `${pref.nameJa}の住みやすさ` }],
    },
    twitter: { card: "summary_large_image", title, description, images: [ogImage] },
  };
}

export default async function PrefPage({ params }: { params: Params }) {
  const pref = getPrefBySlug(params.pref);
  if (!pref) notFound();

  const prefName = pref.nameJa;
  const muni = await listMunicipalities(params.pref);
  const all = await listAll(params.pref); // 市区町村 + 行政区（クロール用の全リンク）
  const stats = prefStats(muni);

  // 家賃が安い市区町村ランキング（実データのみ・昇順 上位10）
  const cheapest = muni
    .filter((m) => hasRent(m.rent.value))
    .sort((a, b) => a.rent.value - b.rent.value)
    .slice(0, 10);

  // 全自治体一覧（行政コード順 = 行政の標準的な並び）。displayName で区はフルネーム表示。
  const listed = [...all].sort((a, b) => a.code.localeCompare(b.code));

  const ldJson = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: SITE.name, item: absoluteUrl("/") },
          { "@type": "ListItem", position: 2, name: prefName, item: absoluteUrl(`/area/${pref.slug}`) },
        ],
      },
      {
        "@type": "AdministrativeArea",
        name: prefName,
        addressCountry: "JP",
        identifier: pref.codePrefix,
        url: absoluteUrl(`/area/${pref.slug}`),
      },
      {
        "@type": "ItemList",
        name: `${prefName}の市区町村`,
        numberOfItems: listed.length,
        itemListElement: listed.map((m, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: m.displayName ?? m.name,
          url: absoluteUrl(`/area/${m.pref}/${m.code}`),
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
        <span className="breadcrumb-current">{prefName}</span>
      </nav>

      <header className="detail-hero">
        <h1 className="detail-title">
          {prefName}
          <span className="detail-title-sub">の住みやすさ・市区町村比較</span>
        </h1>
        <p className="detail-lead">
          {prefName}の全{stats.count}市区町村を、家賃中央値・地価・人口・待機児童・災害リスクで横断比較。
          {stats.rentMedian > 0 && (
            <>家賃中央値は{stats.rentMedian.toLocaleString()}円/月（{stats.rentMin.toLocaleString()}〜{stats.rentMax.toLocaleString()}円/月）、</>
          )}
          待機児童ゼロは{stats.waitlistZero}自治体です。
        </p>
        <ul className="hero-stats">
          <HeroStat label="市区町村数" value={`${stats.count}`} highlight />
          <HeroStat
            label="家賃中央値"
            value={stats.rentMedian > 0 ? `${stats.rentMedian.toLocaleString()}円/月` : "データなし"}
          />
          <HeroStat label="待機児童ゼロ" value={`${stats.waitlistZero}自治体`} />
          <HeroStat label="浸水想定あり" value={`${stats.floodCount}自治体`} />
        </ul>
        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href={`/?pref=${pref.slug}`} className="related-card" style={{ display: "inline-flex", width: "auto", padding: "8px 14px" }}>
            <span className="related-name">🗺 地図で{prefName}を見る</span>
          </Link>
          <Link href="/ranking" className="related-card" style={{ display: "inline-flex", width: "auto", padding: "8px 14px" }}>
            <span className="related-name">📊 全国ランキングを見る</span>
          </Link>
        </div>
      </header>

      {cheapest.length > 0 && (
        <section className="detail-section">
          <h2 className="detail-h2">家賃が安い市区町村ランキング</h2>
          <p className="detail-p" style={{ color: "var(--text-muted)", fontSize: 13.5 }}>
            {prefName}内で民営借家中央値が低い順 上位{cheapest.length}自治体です。
          </p>
          <ol className="pref-rank">
            {cheapest.map((m, i) => (
              <li key={m.code}>
                <Link href={`/area/${m.pref}/${m.code}`} className="pref-rank-item">
                  <span className="pref-rank-no">{i + 1}</span>
                  <span className="pref-rank-name">{m.displayName ?? m.name}</span>
                  <span className="pref-rank-value">
                    {m.rent.value.toLocaleString()}円/月
                    <span className="pref-rank-band">{rentBand(m.rent.value)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="detail-section">
        <h2 className="detail-h2">{prefName}の全市区町村一覧</h2>
        <p className="detail-p" style={{ color: "var(--text-muted)", fontSize: 13.5 }}>
          各自治体名をタップすると、家賃・地価・子育て・災害リスクの詳細ページに移動します。
        </p>
        <div className="pref-table-wrap">
          <table className="pref-table">
            <thead>
              <tr>
                <th scope="col">自治体</th>
                <th scope="col" className="num">家賃中央値</th>
                <th scope="col" className="num">地価（住宅地）</th>
                <th scope="col" className="num">人口</th>
              </tr>
            </thead>
            <tbody>
              {listed.map((m) => (
                <tr key={m.code}>
                  <th scope="row">
                    <Link href={`/area/${m.pref}/${m.code}`} className="pref-table-link">
                      {m.displayName ?? m.name}
                    </Link>
                  </th>
                  <td className="num">{hasRent(m.rent.value) ? `${m.rent.value.toLocaleString()}円` : "—"}</td>
                  <td className="num">{hasLandPrice(m.landPrice.value) ? `${m.landPrice.value.toLocaleString()}円/㎡` : "—"}</td>
                  <td className="num">{m.population.toLocaleString()}人</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="detail-section">
        <h2 className="detail-h2">出典・データについて</h2>
        <p className="detail-p" style={{ fontSize: 13, color: "var(--text-muted)" }}>
          本ページの数値は政府統計・国土数値情報の実データです。家賃は住宅・土地統計調査、人口は国勢調査（ともに e-Stat 経由）、地価は地価公示・地価調査、ハザードは不動産情報ライブラリ（reinfolib）／国土数値情報、待機児童はこども家庭庁の公表値に基づきます。データのない項目は推計で埋めず「—／データなし」と明示しています。
        </p>
      </section>

      <div style={{ marginTop: 28, display: "flex", gap: 12 }}>
        <Link href="/" className="detail-back">← 地図に戻る</Link>
      </div>
    </div>
  );
}

function HeroStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <li className={`hero-stat ${highlight ? "is-highlight" : ""}`}>
      <span className="hero-stat-label">{label}</span>
      <span className="hero-stat-value">{value}</span>
    </li>
  );
}
