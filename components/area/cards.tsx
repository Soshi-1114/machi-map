// 詳細ページの再利用カード群（KPI・指標カード・回遊カード・ランキング・類似エリア・
// データなし・出典行）。すべて素の className（area-detail.css）で配色する server component。
import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, ChevronRight, MinusCircle, MapPin } from "lucide-react";

// ---- KPI カード（家賃・人口・地価・待機児童などの横長タイル）----
export function KpiCard({
  icon: Icon,
  tone,
  label,
  value,
  unit,
  sub,
  nodataLabel = "データなし",
}: {
  icon: LucideIcon;
  tone?: string;
  label: string;
  value: string | null;
  unit?: string;
  sub?: ReactNode;
  nodataLabel?: string;
}) {
  const isNoData = value === null;
  return (
    <div className={`ad-kpi ${isNoData ? "is-nodata" : ""}`}>
      <span className={`ad-kpi-icon ${tone ?? ""}`} aria-hidden="true">
        <Icon size={22} />
      </span>
      <span className="ad-kpi-label">{label}</span>
      {isNoData ? (
        <span className="ad-kpi-value is-nodata">{nodataLabel}</span>
      ) : (
        <span className="ad-kpi-value">
          {value}
          {unit && <span className="ad-kpi-unit">{unit}</span>}
        </span>
      )}
      {sub && <span className="ad-kpi-sub">{sub}</span>}
    </div>
  );
}

// ---- 指標カード（詳細グリッドの共通シェル: アイコン＋タイトル＋本文＋詳細リンク）----
export function MetricCard({
  icon: Icon,
  tone,
  title,
  badge,
  link,
  children,
}: {
  icon: LucideIcon;
  tone?: string;
  title: string;
  badge?: { text: string; tone?: string };
  link?: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <article className="ad-metric-card">
      <header className="ad-metric-head">
        <span className={`ad-metric-icon ${tone ?? ""}`} aria-hidden="true">
          <Icon size={20} />
        </span>
        <h3 className="ad-metric-title">{title}</h3>
        {badge && <span className={`ad-chip ${badge.tone ?? ""}`}>{badge.text}</span>}
      </header>
      <div className="ad-metric-body">{children}</div>
      {link && (
        <Link href={link.href} className="ad-metric-link">
          {link.label}
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      )}
    </article>
  );
}

export function MetricPrimary({
  value,
  unit,
  nodataLabel = "データなし",
}: {
  value: string | null;
  unit?: string;
  nodataLabel?: string;
}) {
  if (value === null) return <p className="ad-metric-primary is-nodata">{nodataLabel}</p>;
  return (
    <p className="ad-metric-primary">
      {value}
      {unit && <span className="ad-metric-unit">{unit}</span>}
    </p>
  );
}

// ---- 回遊カード（家賃が近い・主要自治体・兄弟区）----
export function AreaLinkCard({
  href,
  name,
  meta,
}: {
  href: string;
  name: string;
  meta: string;
}) {
  return (
    <Link href={href} className="ad-arealink">
      <span className="ad-arealink-name">{name}</span>
      <span className="ad-arealink-meta">{meta}</span>
      <ChevronRight size={16} aria-hidden="true" />
    </Link>
  );
}

// ---- ランキングカード（カード全体がクリック可能。順位は任意）----
export function RankingCard({
  icon: Icon,
  title,
  rankText,
  href,
}: {
  icon: LucideIcon;
  title: string;
  rankText?: string;
  href: string;
}) {
  return (
    <Link href={href} className="ad-rankcard">
      <span className="ad-rankcard-icon" aria-hidden="true">
        <Icon size={20} />
      </span>
      <span className="ad-rankcard-body">
        <span className="ad-rankcard-title">{title}</span>
        {rankText && <span className="ad-rankcard-rank">{rankText}</span>}
      </span>
      <ArrowRight size={18} aria-hidden="true" className="ad-rankcard-arrow" />
    </Link>
  );
}

// ---- 類似エリアカード（写真は使わず、似ている根拠を実データ数値で見せる）----
export function SimilarAreaCard({
  href,
  name,
  comment,
  rent,
  population,
}: {
  href: string;
  name: string;
  comment: string;
  /** 家賃中央値の表示文字列。データなしは null */
  rent: string | null;
  /** 人口の表示文字列 */
  population: string;
}) {
  return (
    <Link href={href} className="ad-similar">
      <span className="ad-similar-head">
        <span className="ad-similar-icon" aria-hidden="true">
          <MapPin size={16} />
        </span>
        <span className="ad-similar-name">{name}</span>
        <ChevronRight size={16} aria-hidden="true" className="ad-similar-arrow" />
      </span>
      <span className="ad-similar-comment">{comment}</span>
      <span className="ad-similar-stats">
        <span className="ad-similar-stat">
          <b>{rent ?? "—"}</b>
          <small>家賃/月</small>
        </span>
        <span className="ad-similar-stat">
          <b>{population}</b>
          <small>人口</small>
        </span>
      </span>
    </Link>
  );
}

// ---- データなし／出典行 ----
export function NoData({ text, reason }: { text: string; reason: string }) {
  return (
    <div className="ad-nodata">
      <MinusCircle size={20} aria-hidden="true" />
      <p className="ad-nodata-text">
        <strong>{text}</strong>
        <span className="ad-nodata-reason">{reason}</span>
      </p>
    </div>
  );
}

export function SourceLine({
  source,
  asOf,
  estimated,
}: {
  source: string;
  asOf: string;
  estimated?: boolean;
}) {
  return (
    <p className="ad-source">
      出典: {source}（{asOf}）{estimated && <span className="ad-est">推計</span>}
    </p>
  );
}
