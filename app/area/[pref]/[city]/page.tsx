import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getMunicipality, listAll, listAllAcrossPrefs } from "@/lib/metrics";
import { buildSummary } from "@/lib/summary";
import { findRelatedByRent } from "@/lib/related";
import { RANKINGS } from "@/lib/rankings";
import { buildFaq } from "@/lib/faq";
import { SITE, prefNameOf, absoluteUrl } from "@/lib/site";
import { hasRent, rentBand, RENT_BAND_LABELS } from "@/lib/rentColor";
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

  // 家賃の県内ポジション（バンド中央を 10/30/50/70/90% にマップ。rentBand と同じ境界を共有）
  const rentLabels = RENT_BAND_LABELS as readonly string[];
  const rentIdx = hasRent(m.rent.value) ? rentLabels.indexOf(rentBand(m.rent.value)) : -1;
  const rentPos = rentIdx >= 0 ? rentIdx * 20 + 10 : 0;

  // 人口トレンドのバッジ表現
  const trend = m.populationTrend;
  const trendTone = trend === "増加" || trend === "微増" ? "up" : trend === "減少" || trend === "微減" ? "down" : null;

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
        <Link href={`/area/${m.pref}`} className="detail-pref-badge">
          <Icon name="pin" size={14} />
          {prefName}
        </Link>
        <h1 className="detail-title">
          {heading}
          <span className="detail-title-sub">の住みやすさ</span>
        </h1>
        <p className="detail-lead">{buildSummary(m)}</p>
        <ul className="hero-stats">
          <HeroStat
            icon="home"
            label="家賃中央値"
            value={hasRent(m.rent.value) ? m.rent.value.toLocaleString() : null}
            unit="円/月"
            highlight
            badge={hasRent(m.rent.value) ? { text: `県内で${rentBand(m.rent.value)}`, tone: "rent" } : undefined}
          />
          <HeroStat
            icon="users"
            label="人口"
            value={m.population.toLocaleString()}
            unit="人"
            badge={trendTone ? { text: trend, tone: trendTone, icon: trendTone === "up" ? "trendUp" : "trendDown" } : { text: trend, tone: "muted" }}
          />
          <HeroStat
            icon="yen"
            label="地価（住宅地）"
            value={hasLandPrice(m.landPrice.value) ? m.landPrice.value.toLocaleString() : null}
            unit="円/㎡"
            nodataLabel="対象外"
          />
          <HeroStat
            icon="smile"
            label="待機児童"
            value={isWaitlistDisclosed(m.waitlistChildren) ? `${m.waitlistChildren.value}` : null}
            unit="人"
            badge={
              isWaitlistDisclosed(m.waitlistChildren) && m.waitlistChildren.value === 0
                ? { text: "待機児童ゼロ", tone: "good" }
                : undefined
            }
            nodataLabel="非公表"
          />
        </ul>
        <p className="detail-honesty-note">
          <Icon name="info" size={16} />
          数値は政府統計・国土数値情報の実データ。データのない項目は推計で埋めず「データなし／対象外」と明示しています。
        </p>
      </header>

      <section className="detail-section">
        <SectionHead icon="home" tone="tone-rent" title="家賃・住居コスト" />
        <div className="detail-card">
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
            {" "}地価（住宅地）は{" "}
            {hasLandPrice(m.landPrice.value) ? (
              <><strong>{m.landPrice.value.toLocaleString()}円/㎡</strong> です。</>
            ) : (
              <><strong>データなし</strong>です（{coverageReason(m.landPrice.source)}）。</>
            )}
          </p>
          {hasRent(m.rent.value) && (
            <div className="rent-bar">
              <div className="rent-bar-scale">
                <span>県内で安い</span>
                <span>県内で高い</span>
              </div>
              <div className="rent-bar-track">
                <span className="rent-bar-marker" style={{ left: `${rentPos}%` }} />
              </div>
            </div>
          )}
          {hasRent(m.rent.value) && (
            <SourceLine source={m.rent.source} asOf={m.rent.asOf} estimated={m.rent.isEstimated} />
          )}
        </div>
      </section>

      <section className="detail-section">
        <SectionHead icon="smile" tone="tone-kids" title="子育て環境" />
        <ul className="mini-cards cols-2">
          {isWaitlistDisclosed(m.waitlistChildren) ? (
            <li className="mini-card">
              <div className="mini-card-label">待機児童数</div>
              <div className="mini-card-value">
                {m.waitlistChildren.value}
                <span className="unit"> 人</span>
                {m.waitlistChildren.value === 0 && <span className="mini-card-flag">待機児童ゼロ</span>}
              </div>
              <p className="mini-card-sub">出典: {m.waitlistChildren.source}（{m.waitlistChildren.asOf}）</p>
            </li>
          ) : (
            <li className="mini-card is-nodata">
              <div className="mini-card-label">待機児童数</div>
              <div className="mini-card-value is-nodata">区別非公表</div>
              <p className="mini-card-sub">
                {m.waitlistChildren.source.replace("区別非公表（", "").replace(/）.*$/, "")}
              </p>
            </li>
          )}
          <li className="mini-card">
            <div className="mini-card-label">人口トレンド</div>
            <div className="mini-card-value">
              {m.population.toLocaleString()}
              <span className="unit"> 人</span>
              <span className={`mini-card-flag flag-${trendTone ?? "muted"}`}>{trend}</span>
            </div>
            <p className="mini-card-sub">令和7年(2025)国勢調査 速報</p>
          </li>
        </ul>
      </section>

      <section className="detail-section">
        <SectionHead icon="alert" tone="tone-hazard" title="災害リスク" />
        {isHazardEvaluated(m.hazard.source) ? (
          <>
            <div className="hazard-grid">
              <div className={`hazard-cell ${m.hazard.hasFloodRisk ? "is-risk" : ""}`}>
                <Icon name="droplet" size={24} />
                <div>
                  <div className="hazard-cell-label">浸水想定区域</div>
                  <div className="hazard-cell-value">{m.hazard.hasFloodRisk ? "あり" : "なし"}</div>
                </div>
              </div>
              <div className={`hazard-cell ${m.hazard.hasLandslideRisk ? "is-risk" : ""}`}>
                <Icon name="mountain" size={24} />
                <div>
                  <div className="hazard-cell-label">土砂災害警戒区域</div>
                  <div className="hazard-cell-value">{m.hazard.hasLandslideRisk ? "あり" : "なし"}</div>
                </div>
              </div>
            </div>
            {m.hazard.note && (
              <p className="detail-note">
                <Icon name="info" size={15} />
                {m.hazard.note}
              </p>
            )}
            <SourceLine source={m.hazard.source} asOf={m.hazard.asOf} />
          </>
        ) : (
          <NoDataCard text="ハザード評価は対象外です。" reason={coverageReason(m.hazard.source)} />
        )}
      </section>

      {m.amenities && (
        <section className="detail-section">
          <SectionHead icon="building" tone="tone-infra" title="生活インフラ" />
          {isAmenitiesCounted(m.amenities.source) ? (
            <ul className="mini-cards cols-3">
              <InfraCard icon="train" value={m.amenities.stations} label="駅数" />
              <InfraCard icon="building" value={m.amenities.preschools} label="保育・幼稚園" />
              <InfraCard icon="activity" value={m.amenities.medicalFacilities} label="医療機関" />
            </ul>
          ) : (
            <NoDataCard text="集計対象外です。" reason={coverageReason(m.amenities.source)} />
          )}
          <p className="detail-source-line">
            出典: {m.amenities.source}（{m.amenities.asOf}）
          </p>
        </section>
      )}

      <section className="detail-section">
        <SectionHead title="家賃水準が近い自治体" />
        <p className="detail-sublead">{m.name}と家賃中央値が近い{prefName}の自治体です。</p>
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
          <SectionHead title={`${parent.name}のほかの区`} />
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
          <SectionHead
            title={`${prefName}の主要自治体`}
            link={{ href: `/area/${m.pref}`, label: `全${prefName}の一覧` }}
          />
          <p className="detail-sublead">{prefName}で人口の多い自治体です。</p>
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
        <SectionHead title="ランキングで比較" />
        <ul className="related-grid">
          {RANKINGS.map((r) => (
            <li key={r.slug}>
              <Link href={`/ranking/${r.slug}`} className="related-card">
                <span className="related-name">{r.title}</span>
                <Icon name="arrowRight" size={16} />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="detail-section">
        <SectionHead title={`${m.name}のよくある質問`} />
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
        <SectionHead title="出典・データについて" />
        <p className="detail-p detail-p-muted">
          本ページの数値は政府統計・国土数値情報の実データです。家賃は住宅・土地統計調査、人口は国勢調査（ともに e-Stat 経由）、地価は地価公示・地価調査、ハザード・生活インフラは不動産情報ライブラリ（reinfolib）／国土数値情報、待機児童はこども家庭庁の公表値に基づきます。データのない項目は推計で埋めず「データなし／対象外」と明示しています。
        </p>
      </section>

      <div className="detail-footnav">
        <Link href={`/area/${m.pref}`} className="detail-back"><Icon name="arrowLeft" size={14} />{prefName}の一覧</Link>
        <Link href="/ranking" className="detail-back"><Icon name="trophy" size={14} />ランキング</Link>
        <Link href="/" className="detail-back"><Icon name="map" size={14} />地図に戻る</Link>
      </div>
    </div>
  );
}

type Badge = { text: string; tone: "rent" | "good" | "up" | "down" | "muted"; icon?: IconName };

function HeroStat({
  icon,
  label,
  value,
  unit,
  highlight,
  badge,
  nodataLabel = "データなし",
}: {
  icon: IconName;
  label: string;
  value: string | null;
  unit?: string;
  highlight?: boolean;
  badge?: Badge;
  nodataLabel?: string;
}) {
  const isNoData = value === null;
  return (
    <li className={`hero-stat ${highlight && !isNoData ? "is-highlight" : ""} ${isNoData ? "is-nodata-card" : ""}`}>
      <span className="hero-stat-head">
        <Icon name={icon} size={15} />
        {label}
      </span>
      {isNoData ? (
        <span className="hero-stat-value is-nodata">{nodataLabel}</span>
      ) : (
        <span className="hero-stat-value">
          {value}
          {unit && <span className="unit"> {unit}</span>}
        </span>
      )}
      {badge && !isNoData && (
        <span className={`hero-stat-badge badge-${badge.tone}`}>
          {badge.icon && <Icon name={badge.icon} size={13} />}
          {badge.text}
        </span>
      )}
    </li>
  );
}

function SectionHead({
  icon,
  tone,
  title,
  link,
}: {
  icon?: IconName;
  tone?: string;
  title: string;
  link?: { href: string; label: string };
}) {
  return (
    <div className="detail-shead">
      {icon && (
        <span className={`detail-shead-icon ${tone ?? ""}`}>
          <Icon name={icon} size={18} />
        </span>
      )}
      <h2 className="detail-h2">{title}</h2>
      {link && (
        <Link href={link.href} className="detail-shead-link">
          {link.label}
          <Icon name="arrowRight" size={13} />
        </Link>
      )}
    </div>
  );
}

function InfraCard({ icon, value, label }: { icon: IconName; value: number; label: string }) {
  return (
    <li className="mini-card infra-card center">
      <Icon name={icon} size={20} />
      <div className="mini-card-value">{value.toLocaleString()}</div>
      <div className="mini-card-label">{label}</div>
    </li>
  );
}

function NoDataCard({ text, reason }: { text: string; reason: string }) {
  return (
    <div className="nodata-card">
      <Icon name="minusCircle" size={20} />
      <p className="nodata-card-text">
        <strong>{text}</strong>
        <span className="nodata-card-reason">{reason}</span>
      </p>
    </div>
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

type IconName =
  | "pin" | "home" | "users" | "yen" | "smile" | "info" | "trendUp" | "trendDown"
  | "alert" | "droplet" | "mountain" | "train" | "building" | "activity"
  | "minusCircle" | "arrowRight" | "arrowLeft" | "trophy" | "map";

const ICON_PATHS: Record<IconName, ReactNode> = {
  pin: <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>,
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  yen: <path d="M7 3l5 6 5-6M12 9v12M8 12.5h8M8 16.5h8" />,
  smile: <><circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><path d="M9 9h.01M15 9h.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  trendUp: <><path d="M3 17l6-6 4 4 8-8" /><path d="M17 7h4v4" /></>,
  trendDown: <><path d="M3 7l6 6 4-4 8 8" /><path d="M17 17h4v-4" /></>,
  alert: <><path d="M10.3 3.8 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>,
  droplet: <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" />,
  mountain: <path d="M3 20h18L13.5 6 9 13l-2.5-3L3 20Z" />,
  train: <><rect x="5" y="3" width="14" height="13" rx="2.5" /><path d="M5 11h14" /><path d="M8 16l-2 4M16 16l2 4" /></>,
  building: <><rect x="5" y="3" width="14" height="18" rx="1.5" /><path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h6" /></>,
  activity: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  minusCircle: <><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></>,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  arrowLeft: <path d="M19 12H5M11 6l-6 6 6 6" />,
  trophy: <><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" /><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" /></>,
  map: <><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" /><path d="M9 4v14M15 6v14" /></>,
};

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}
