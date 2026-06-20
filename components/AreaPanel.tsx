"use client";

import Link from "next/link";
import type { Municipality } from "@/lib/types";
import { buildSummary } from "@/lib/summary";
import { hasRent } from "@/lib/rentColor";
import { isWaitlistDisclosed } from "@/lib/waitlist";
import { hasLandPrice } from "@/lib/landPrice";

type Props = {
  municipality: Municipality | null;
  onClose: () => void;
};

export default function AreaPanel({ municipality, onClose }: Props) {
  if (!municipality) return null;
  const m = municipality;
  return (
    <aside className="area-panel" aria-label={`${m.name}の詳細情報`}>
      <div className="panel-head">
        <div className="panel-head-top">
          <h2 className="panel-title">{m.name}</h2>
          <button className="panel-close" aria-label="閉じる" onClick={onClose}>×</button>
        </div>
        <p className="panel-sub">
          人口 {m.population.toLocaleString()}人
          <span className="trend-chip">{m.populationTrend}</span>
        </p>
      </div>
      <div className="panel-body">
        <div className="summary-block">{buildSummary(m)}</div>
        <MetricCards m={m} />
        <Link href={`/area/${m.pref}/${m.code}`} className="cta-button">
          詳細を見る →
        </Link>
      </div>
    </aside>
  );
}

export function MetricCards({ m }: { m: Municipality }) {
  const rentHasData = hasRent(m.rent.value);
  const cards = [
    rentHasData
      ? { label: "家賃中央値", value: `${m.rent.value.toLocaleString()} ${m.rent.unit}`, source: m.rent.source, asOf: m.rent.asOf, est: m.rent.isEstimated }
      : { label: "家賃中央値", value: "データなし", source: "住宅統計の集計対象外", asOf: "-", est: false },
    hasLandPrice(m.landPrice.value)
      ? { label: "地価", value: `${m.landPrice.value.toLocaleString()} ${m.landPrice.unit}`, source: m.landPrice.source, asOf: m.landPrice.asOf, est: m.landPrice.isEstimated }
      : { label: "地価", value: "データなし", source: m.landPrice.source, asOf: m.landPrice.asOf, est: false },
    isWaitlistDisclosed(m.waitlistChildren)
      ? { label: "待機児童", value: `${m.waitlistChildren.value} ${m.waitlistChildren.unit}`, source: m.waitlistChildren.source, asOf: m.waitlistChildren.asOf, est: m.waitlistChildren.isEstimated }
      : { label: "待機児童", value: "データなし", source: m.waitlistChildren.source, asOf: m.waitlistChildren.asOf, est: false },
    { label: "災害リスク", value: m.hazard.hasFloodRisk ? "浸水想定あり" : "目立った想定なし", source: m.hazard.source, asOf: m.hazard.asOf, est: false },
  ];
  return (
    <div className="metric-grid">
      {cards.map((c) => (
        <div key={c.label} className="metric-card">
          <div className="metric-label">{c.label}</div>
          <div className="metric-value">
            {c.value}
            {c.est && <span className="metric-est">推計</span>}
          </div>
          <div className="metric-meta">
            {c.source}（{c.asOf}）
          </div>
        </div>
      ))}
    </div>
  );
}
