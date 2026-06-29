import "./area-detail.css";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  MapPin,
  Home,
  Users,
  JapaneseYen,
  Baby,
  Wallet,
  ShieldAlert,
  Building2,
  Globe2,
  TrainFront,
  Stethoscope,
  Info,
  Trophy,
  Map as MapIcon,
  ArrowLeft,
  Search,
} from "lucide-react";
import { getMunicipality, listAll, listAllAcrossPrefs } from "@/lib/metrics";
import { buildSummary } from "@/lib/summary";
import { findRelatedByRent, findSimilar } from "@/lib/related";
import { RANKINGS } from "@/lib/rankings";
import { getRankPositions } from "@/lib/rankingStats";
import { buildFaq } from "@/lib/faq";
import { SITE, prefNameOf, absoluteUrl } from "@/lib/site";
import { hasRent, rentBand } from "@/lib/rentColor";
import { isWaitlistDisclosed } from "@/lib/waitlist";
import { hasLandPrice } from "@/lib/landPrice";
import { isAmenitiesCounted, coverageReason } from "@/lib/coverage";
import { hasForeignData, foreignRatioPct } from "@/lib/foreignResidents";
import { getForeignStats, avgBand, type ForeignComparison } from "@/lib/foreignStats";
import { getAreaStats } from "@/lib/areaStats";
import { computeLivability } from "@/lib/livabilityScore";
import { Reveal } from "@/components/area/Reveal";
import { Section } from "@/components/area/Section";
import { ScorePanel } from "@/components/area/ScorePanel";
import { OverviewCard } from "@/components/area/OverviewCard";
import { DisasterCard } from "@/components/area/DisasterCard";
import { CompareBar, type CompareRow } from "@/components/area/CompareBar";
import {
  KpiCard,
  MetricCard,
  MetricPrimary,
  AreaLinkCard,
  RankingCard,
  SimilarAreaCard,
  NoData,
  SourceLine,
} from "@/components/area/cards";

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

  // SEO 主軸: 大手が手薄な「{自治体} 外国人 割合」「{自治体} 在留外国人」を狙う。
  // 在留外国人統計の対象（北方領土6村など対象外を除く）かつ人口が有効な自治体は
  // 比率を主軸に据え、対象外は人口・住環境にフォールバックする（honesty 方針）。
  const foreignAvailable = hasForeignData(m.foreignResidents.source) && m.population > 0;
  const fc = foreignAvailable ? (await getForeignStats()).get(m.code) ?? null : null;

  const title = foreignAvailable
    ? `${fullName}の在留外国人割合・人口データ｜地図で見る住環境 - ${SITE.name}`
    : `${fullName}の人口・住環境データ｜地図で見る - ${SITE.name}`;

  // description には実数値を2〜3個含める。比較統計（全国平均・順位）が取れる場合は
  // それを優先し、取れない場合は段階的にフォールバックする（数値はビルド時データ由来）。
  let description: string;
  if (foreignAvailable && fc) {
    description = `${fullName}（${prefName}）の在留外国人割合は${fc.ratio.toFixed(2)}%（全国平均${fc.nationalAvg.toFixed(2)}%、全国${fc.nationalRank.toLocaleString()}位）。人口${pop}人などの住環境データを地図とランキングで確認できます。出典: 出入国在留管理庁「在留外国人統計」。`;
  } else if (foreignAvailable) {
    description = `${fullName}（${prefName}）の在留外国人割合は${foreignRatioPct(m).toFixed(2)}%、人口${pop}人。家賃・地価・災害リスクなどの住環境データを地図とランキングで確認できます。出典: 出入国在留管理庁「在留外国人統計」。`;
  } else {
    const rentPhrase = hasRent(m.rent.value) ? `家賃中央値${m.rent.value.toLocaleString()}円/月、` : "";
    const popPhrase = m.population > 0 ? `人口${pop}人、` : "";
    description = `${fullName}（${prefName}）の住環境データ。${popPhrase}${rentPhrase}地価・待機児童・災害リスクなどをまとめて地図とランキングで比較できる${SITE.name}の自治体ページ。`;
  }
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
  const relatedCodes = new Set(related.map((r) => r.code));
  // 「似ているエリア」は家賃＋人口規模で算出し、家賃が近い一覧と重複しないよう除外する。
  const similar = findSimilar(peers, m, 3, relatedCodes);
  const prefName = prefNameOf(m.pref);
  const parent = m.parentCode ? all.find((x) => x.code === m.parentCode) ?? null : null;
  const heading = m.displayName ?? m.name;

  // 同県の主要自治体（人口の多い順）。自身と「家賃が近い」「似ている」既出分を除く。
  const excluded = new Set([m.code, ...relatedCodes, ...similar.map((s) => s.code)]);
  const majorPeers = peers
    .filter((x) => !excluded.has(x.code))
    .sort((a, b) => b.population - a.population)
    .slice(0, 6);
  // 行政区ページなら同じ政令市の他の区（兄弟区）へのリンクを張る。
  const siblings =
    m.level === "ward" && m.parentCode
      ? all.filter((x) => x.level === "ward" && x.parentCode === m.parentCode && x.code !== m.code)
      : [];

  // 解釈の補助線・比較バーの平均値（すべて実データから集計。推計なし）。
  const foreignStats = await getForeignStats();
  const fc: ForeignComparison | null = foreignStats.get(m.code) ?? null;
  const areaStats = await getAreaStats();
  const rankPositions = await getRankPositions();

  // 住みやすさ総合スコア・5軸（実データのみ。治安は法務方針で対象外）。
  const liv = computeLivability(m);

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

  // Dataset 構造化データ（政府統計の実データを地理単位で提示する性質に適合）。
  // variableMeasured は実データのある指標のみ載せる（欠損は推計しない honesty 方針）。
  const variableMeasured = [
    hasRent(m.rent.value) && { "@type": "PropertyValue", name: "民営借家家賃中央値", unitText: "JPY/月", value: m.rent.value },
    hasLandPrice(m.landPrice.value) && { "@type": "PropertyValue", name: "住宅地地価（公示地価）", unitText: "JPY/m2", value: m.landPrice.value },
    { "@type": "PropertyValue", name: "人口", unitText: "人", value: m.population },
    isWaitlistDisclosed(m.waitlistChildren) && { "@type": "PropertyValue", name: "待機児童数", unitText: "人", value: m.waitlistChildren.value },
    hasForeignData(m.foreignResidents.source) && { "@type": "PropertyValue", name: "外国人住民比率", unitText: "%", value: Number(foreignRatioPct(m).toFixed(2)) },
  ].filter(Boolean);

  const dataset = {
    "@type": "Dataset",
    name: `${prefName}${heading}の生活統計データ（家賃・地価・人口・災害リスク・外国人比率）`,
    description: `${prefName}${heading}の家賃中央値・公示地価・人口・待機児童数・災害リスク（浸水／土砂／津波／高潮／液状化）・在留外国人比率を、政府統計（総務省・国土交通省・こども家庭庁・出入国在留管理庁）および国土数値情報の実データでまとめた統計データセット。推計値は使用していません。`,
    url: absoluteUrl(`/area/${m.pref}/${m.code}`),
    identifier: m.code,
    keywords: ["家賃中央値", "公示地価", "人口", "待機児童", "災害リスク", "外国人住民比率", heading, prefName],
    isAccessibleForFree: true,
    creator: { "@type": "Organization", name: SITE.name, url: SITE.baseUrl },
    includedInDataCatalog: { "@type": "DataCatalog", name: "e-Stat 政府統計の総合窓口", url: "https://www.e-stat.go.jp/" },
    spatialCoverage: {
      "@type": "Place",
      name: `${prefName}${heading}`,
      containedInPlace: { "@type": "AdministrativeArea", name: prefName },
    },
    variableMeasured,
  };

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
      dataset,
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

  // データから導く特徴タグ（編集値ではなく実データ由来。honesty 方針）。
  const tags: string[] = [];
  if (hasRent(m.rent.value)) tags.push(`家賃${rentBand(m.rent.value)}`);
  tags.push(`人口${m.populationTrend}`);
  if (isWaitlistDisclosed(m.waitlistChildren) && m.waitlistChildren.value === 0) tags.push("待機児童ゼロ");
  const disasterAxis = liv.axes.find((a) => a.key === "disaster");
  if (disasterAxis?.stars != null && disasterAxis.stars >= 4) tags.push("災害リスク低め");

  // 家賃の比較バー（自治体／県平均／全国平均）。有効値のみ行に積む。
  const rentRows: CompareRow[] = [];
  if (hasRent(m.rent.value)) {
    rentRows.push({ label: m.name, value: m.rent.value, self: true });
    const pa = areaStats.rent.byPref.get(m.pref);
    if (pa != null) rentRows.push({ label: `${prefName}平均`, value: pa });
    if (areaStats.rent.national != null) rentRows.push({ label: "全国平均", value: areaStats.rent.national });
  }

  // 外国人住民比率の比較バー（fc がある＝対象かつ比較可能なときのみ）。
  const foreignRows: CompareRow[] = fc
    ? [
        { label: m.name, value: fc.ratio, self: true },
        { label: `${prefName}平均`, value: fc.prefAvg },
        { label: "全国平均", value: fc.nationalAvg },
      ]
    : [];

  const yen = (v: number) => `${v.toLocaleString()}円`;
  const pct = (v: number) => `${v.toFixed(2)}%`;

  return (
    <div className="ad-root">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ldJson) }} />

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

      {/* ① Hero */}
      <header className="ad-hero">
        <div className="ad-hero-main">
          <Link href={`/area/${m.pref}`} className="ad-pref-badge">
            <MapPin size={14} aria-hidden="true" />
            {prefName}
          </Link>
          <h1 className="ad-title">
            {heading}
            <span className="ad-title-sub">の住みやすさ</span>
          </h1>
          <p className="ad-lead">{buildSummary(m)}</p>
          {tags.length > 0 && (
            <ul className="ad-tags">
              {tags.map((t) => (
                <li key={t} className="ad-tag">{t}</li>
              ))}
            </ul>
          )}
        </div>

        <ScorePanel liv={liv} />
      </header>

      {/* AI総評 + こんな人におすすめ */}
      <Reveal>
        <OverviewCard m={m} liv={liv} />
      </Reveal>

      {/* ② KPIカード */}
      <Reveal>
        <div className="ad-kpis">
          <KpiCard
            icon={Home}
            tone="ad-tone-rent"
            label="家賃中央値"
            value={hasRent(m.rent.value) ? m.rent.value.toLocaleString() : null}
            unit="円/月"
            sub={hasRent(m.rent.value) ? `県内で${rentBand(m.rent.value)}` : undefined}
          />
          <KpiCard
            icon={Users}
            tone="ad-tone-pop"
            label="人口"
            value={m.population.toLocaleString()}
            unit="人"
            sub={`人口トレンド: ${m.populationTrend}`}
          />
          <KpiCard
            icon={JapaneseYen}
            tone="ad-tone-rent"
            label="地価（住宅地）"
            value={hasLandPrice(m.landPrice.value) ? m.landPrice.value.toLocaleString() : null}
            unit="円/㎡"
            nodataLabel="対象外"
          />
          <KpiCard
            icon={Baby}
            tone="ad-tone-kids"
            label="待機児童"
            value={isWaitlistDisclosed(m.waitlistChildren) ? `${m.waitlistChildren.value}` : null}
            unit="人"
            sub={
              isWaitlistDisclosed(m.waitlistChildren) && m.waitlistChildren.value === 0
                ? "待機児童ゼロ"
                : undefined
            }
            nodataLabel="非公表"
          />
        </div>
      </Reveal>

      <p className="ad-honesty">
        <Info size={16} aria-hidden="true" />
        数値は政府統計・国土数値情報の実データです。データのない項目は推計で埋めず「データなし／対象外」と明示しています。
      </p>

      {/* ③ 詳細情報グリッド */}
      <Section icon={Wallet} tone="ad-tone-rent" title="詳細データ">
        <div className="ad-metric-grid">
          {/* 家賃・住宅コスト */}
          <MetricCard
            icon={Wallet}
            tone="ad-tone-rent"
            title="家賃・住居コスト"
            badge={hasRent(m.rent.value) ? { text: rentBand(m.rent.value), tone: "is-warn" } : undefined}
            link={{ href: "/ranking/rent-high", label: "家賃ランキングで比較" }}
          >
            <MetricPrimary value={hasRent(m.rent.value) ? m.rent.value.toLocaleString() : null} unit="円/月" />
            {rentRows.length > 0 ? (
              <CompareBar rows={rentRows} format={yen} caption="家賃中央値の比較（自治体・県平均・全国平均）" />
            ) : (
              <p className="ad-note"><Info size={15} aria-hidden="true" />住宅統計の集計対象外のため家賃データはありません。</p>
            )}
            <p className="ad-note">
              地価（住宅地）:{" "}
              {hasLandPrice(m.landPrice.value)
                ? `${m.landPrice.value.toLocaleString()}円/㎡`
                : `データなし（${coverageReason(m.landPrice.source)}）`}
            </p>
            {hasRent(m.rent.value) && <SourceLine source={m.rent.source} asOf={m.rent.asOf} estimated={m.rent.isEstimated} />}
          </MetricCard>

          {/* 子育て */}
          <MetricCard
            icon={Baby}
            tone="ad-tone-kids"
            title="子育て環境"
            badge={
              isWaitlistDisclosed(m.waitlistChildren) && m.waitlistChildren.value === 0
                ? { text: "待機児童ゼロ", tone: "is-good" }
                : undefined
            }
            link={{ href: "/ranking/waitlist-zero", label: "待機児童ゼロの自治体" }}
          >
            {isWaitlistDisclosed(m.waitlistChildren) ? (
              <>
                <MetricPrimary value={`${m.waitlistChildren.value}`} unit="人" />
                <p className="ad-note">待機児童数（{m.waitlistChildren.asOf}）</p>
                <SourceLine source={m.waitlistChildren.source} asOf={m.waitlistChildren.asOf} />
              </>
            ) : (
              <NoData text="区別非公表です。" reason={m.waitlistChildren.source.replace("区別非公表（", "").replace(/）.*$/, "")} />
            )}
          </MetricCard>

          {/* 災害リスク（横長） */}
          <div className="ad-span-2">
            <MetricCard icon={ShieldAlert} tone="ad-tone-hazard" title="災害リスク">
              <DisasterCard m={m} />
            </MetricCard>
          </div>

          {/* 生活インフラ */}
          {m.amenities && (
            <MetricCard icon={Building2} tone="ad-tone-infra" title="生活インフラ">
              {isAmenitiesCounted(m.amenities.source) ? (
                <>
                  <div className="ad-statline">
                    <span className="ad-stat">
                      <span className="ad-stat-value">{m.amenities.stations.toLocaleString()}</span>
                      <span className="ad-stat-label"><TrainFront size={12} aria-hidden="true" /> 駅数</span>
                    </span>
                    <span className="ad-stat">
                      <span className="ad-stat-value">{m.amenities.preschools.toLocaleString()}</span>
                      <span className="ad-stat-label"><Baby size={12} aria-hidden="true" /> 保育・幼稚園</span>
                    </span>
                    <span className="ad-stat">
                      <span className="ad-stat-value">{m.amenities.medicalFacilities.toLocaleString()}</span>
                      <span className="ad-stat-label"><Stethoscope size={12} aria-hidden="true" /> 医療機関</span>
                    </span>
                  </div>
                  <SourceLine source={m.amenities.source} asOf={m.amenities.asOf} />
                </>
              ) : (
                <NoData text="集計対象外です。" reason={coverageReason(m.amenities.source)} />
              )}
            </MetricCard>
          )}

          {/* 外国人比率 */}
          <MetricCard
            icon={Globe2}
            tone="ad-tone-foreign"
            title="外国人住民（多様性・国際性）"
            link={{ href: "/map/foreign-ratio", label: "地図・ランキングで見る" }}
          >
            {hasForeignData(m.foreignResidents.source) ? (
              <>
                <MetricPrimary value={foreignRatioPct(m).toFixed(2)} unit="%" />
                <p className="ad-note">外国人住民 {m.foreignResidents.value.toLocaleString()}人</p>
                {foreignRows.length > 0 && fc ? (
                  <>
                    <CompareBar rows={foreignRows} format={pct} caption="外国人住民比率の比較（自治体・県平均・全国平均）" />
                    <p className="ad-note">
                      全国平均（{fc.nationalAvg.toFixed(2)}%）
                      {avgBand(fc.ratio, fc.nationalAvg) === "similar"
                        ? "と同程度"
                        : `より${avgBand(fc.ratio, fc.nationalAvg) === "higher" ? "高め" : "低め"}`}
                      。比率の高い順で全国 {fc.nationalRank.toLocaleString()}位 / {fc.nationalTotal.toLocaleString()}自治体。多様性・国際性の目安です。
                    </p>
                  </>
                ) : (
                  <p className="ad-note"><Info size={15} aria-hidden="true" />全国・県平均との比較は、比較データがないため表示していません。</p>
                )}
                <SourceLine source={m.foreignResidents.source} asOf={m.foreignResidents.asOf} />
              </>
            ) : (
              <NoData text="在留外国人統計の対象外です。" reason={coverageReason(m.foreignResidents.source)} />
            )}
          </MetricCard>
        </div>
      </Section>

      {/* 家賃が近い自治体 */}
      {related.length > 0 && (
        <Section icon={Home} tone="ad-tone-rent" title="家賃水準が近い自治体" sub={`${m.name}と家賃中央値が近い${prefName}の自治体`}>
          <ul className="ad-arealink-grid">
            {related.map((r) => (
              <li key={r.code}>
                <AreaLinkCard
                  href={`/area/${r.pref}/${r.code}`}
                  name={r.displayName ?? r.name}
                  meta={hasRent(r.rent.value) ? `${r.rent.value.toLocaleString()}円/月` : "データなし"}
                />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* 似ているエリア */}
      {similar.length > 0 && (
        <Section icon={Search} tone="ad-tone-pop" title="似ているエリアを探す" sub={`${m.name}と特徴が似ているエリア`}>
          <ul className="ad-similar-grid">
            {similar.map((s) => (
              <li key={s.code}>
                <SimilarAreaCard
                  href={`/area/${s.pref}/${s.code}`}
                  name={s.displayName ?? s.name}
                  comment="家賃・人口規模が近い"
                  rent={hasRent(s.rent.value) ? `${s.rent.value.toLocaleString()}円` : null}
                  population={`${s.population.toLocaleString()}人`}
                />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* 兄弟区 */}
      {siblings.length > 0 && parent && (
        <Section icon={MapIcon} tone="ad-tone-infra" title={`${parent.name}のほかの区`}>
          <ul className="ad-arealink-grid">
            {siblings.map((s) => (
              <li key={s.code}>
                <AreaLinkCard
                  href={`/area/${s.pref}/${s.code}`}
                  name={s.name}
                  meta={hasRent(s.rent.value) ? `${s.rent.value.toLocaleString()}円/月` : "データなし"}
                />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* 主要自治体 */}
      {majorPeers.length > 0 && (
        <Section
          icon={Users}
          tone="ad-tone-pop"
          title={`${prefName}の主要自治体`}
          sub={`${prefName}で人口の多い自治体`}
          link={{ href: `/area/${m.pref}`, label: `全${prefName}の一覧` }}
        >
          <ul className="ad-arealink-grid">
            {majorPeers.map((p) => (
              <li key={p.code}>
                <AreaLinkCard
                  href={`/area/${p.pref}/${p.code}`}
                  name={p.displayName ?? p.name}
                  meta={`人口 ${p.population.toLocaleString()}人`}
                />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ランキング */}
      <Section icon={Trophy} tone="ad-tone-hazard" title="ランキングで比較">
        <ul className="ad-rank-grid">
          {RANKINGS.map((r) => {
            const pos = rankPositions.get(r.slug)?.get(m.code);
            return (
              <li key={r.slug}>
                <RankingCard
                  icon={Trophy}
                  title={r.shortLabel}
                  rankText={pos ? `全国 ${pos.rank.toLocaleString()}位 / ${pos.total.toLocaleString()}` : undefined}
                  href={`/ranking/${r.slug}`}
                />
              </li>
            );
          })}
        </ul>
      </Section>

      {/* FAQ（Accordion・デフォルト閉じる） */}
      <Section icon={Info} tone="ad-tone-infra" title={`${m.name}のよくある質問`}>
        <div className="ad-faq">
          {faq.map(({ q, a }, i) => (
            <details key={i} className="ad-faq-item">
              <summary className="ad-faq-q">{q}</summary>
              <div className="ad-faq-a">{a}</div>
            </details>
          ))}
        </div>
      </Section>

      {/* 出典（折りたたみ） */}
      <Reveal>
        <details className="ad-sources" style={{ marginTop: 32 }}>
          <summary className="ad-sources-summary">
            <Info size={15} aria-hidden="true" />
            出典・データについて
          </summary>
          <p className="ad-sources-body">
            本ページの数値は政府統計・国土数値情報の実データです。家賃は住宅・土地統計調査、人口は国勢調査（ともに e-Stat 経由）、地価は地価公示・地価調査、ハザード・生活インフラは不動産情報ライブラリ（reinfolib）／国土数値情報、待機児童はこども家庭庁、外国人住民は出入国在留管理庁「在留外国人統計」（e-Stat）の公表値に基づきます。総合スコアは公表値のみから算出した目安で、データのない指標は除外しています。データのない項目は推計で埋めず「データなし／対象外」と明示しています。
          </p>
        </details>
      </Reveal>

      {/* ページ下部 CTA */}
      <Reveal>
        <section className="ad-cta">
          <h2 className="ad-cta-title">条件を変えてエリアを探す</h2>
          <p className="ad-cta-sub">あなたの希望条件に合うエリアを見つけましょう。</p>
          <ul className="ad-cta-chips">
            <li>
              <Link href="/ranking/rent-cheap" className="ad-cta-chip"><Wallet size={16} aria-hidden="true" />家賃が安いエリア</Link>
            </li>
            <li>
              <Link href="/ranking/waitlist-zero" className="ad-cta-chip"><Baby size={16} aria-hidden="true" />待機児童ゼロ</Link>
            </li>
            <li>
              <Link href="/map/foreign-ratio" className="ad-cta-chip"><Globe2 size={16} aria-hidden="true" />外国人比率で見る</Link>
            </li>
            <li>
              <Link href="/" className="ad-cta-chip"><MapIcon size={16} aria-hidden="true" />地図で探す</Link>
            </li>
          </ul>
        </section>
      </Reveal>

      <div className="ad-footnav">
        <Link href={`/area/${m.pref}`} className="ad-back"><ArrowLeft size={14} aria-hidden="true" />{prefName}の一覧</Link>
        <Link href="/ranking" className="ad-back"><Trophy size={14} aria-hidden="true" />ランキング</Link>
        <Link href="/" className="ad-back"><MapIcon size={14} aria-hidden="true" />地図に戻る</Link>
      </div>
    </div>
  );
}
