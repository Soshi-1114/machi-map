"use client";

import Link from "next/link";
import type { Municipality, MuniSummary } from "@/lib/types";
import { buildSummary } from "@/lib/summary";
import { hasRent } from "@/lib/rentColor";
import { isWaitlistDisclosed } from "@/lib/waitlist";
import { hasLandPrice } from "@/lib/landPrice";
import { isHazardEvaluated } from "@/lib/coverage";
import { floodLevelOf, landslideLevelOf, floodGraded, floodLevelLabel, landslideLevelLabel } from "@/lib/hazardScale";

type Props = {
  municipality: Municipality | null;
  // 選択中だが詳細取得待ちの間は空状態を出さない（クリック直後のチラつき防止）
  selectedCode?: string | null;
  // 同県・同階層で家賃が近い自治体（CTA 下の余白に置くクイックリンク）
  related?: MuniSummary[];
  onClose: () => void;
};

export default function AreaPanel({ municipality, selectedCode, related, onClose }: Props) {
  if (!municipality) {
    if (selectedCode) return null; // 取得中
    // 未選択時：操作を促す空状態ガイド（AreaPanel は PC のみ描画される）
    return (
      <div className="area-hint" role="note">
        <PointerIcon />
        <span>
          地図の自治体を<strong>クリック</strong>、または上部で<strong>検索</strong>すると詳細が表示されます
        </span>
      </div>
    );
  }
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
        {related && related.length > 0 && (
          <div className="panel-related">
            <div className="panel-related-title">家賃が近い近隣の自治体</div>
            <ul className="panel-related-list">
              {related.map((r) => (
                <li key={r.code}>
                  <Link href={`/area/${r.pref}/${r.code}`} className="panel-related-item">
                    <span className="panel-related-name">{r.name}</span>
                    <span className="panel-related-rent">
                      {hasRent(r.rent) ? `${r.rent.toLocaleString()} 円/月` : "データなし"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </aside>
  );
}

function PointerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 11.5V5.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M12 11V4.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M15 11.5V7a1.5 1.5 0 0 1 3 0v7a6 6 0 0 1-6 6h-1.5a5 5 0 0 1-4-2l-2.5-3.2a1.5 1.5 0 0 1 2.2-2L9 13" />
    </svg>
  );
}

// 災害リスクカードの値。段階値データは浸水深を見出しに（無ければ土砂区分）、
// 旧 boolean データは「浸水想定あり/目立った想定なし」にフォールバックする。
function hazardCardValue(h: Municipality["hazard"]): string {
  if (floodGraded(h)) {
    const f = floodLevelOf(h);
    if (f > 0) return `浸水 最大${floodLevelLabel(f)}`;
    const l = landslideLevelOf(h);
    if (l > 0) return `土砂 ${landslideLevelLabel(l)}`;
    return "目立った想定なし";
  }
  return h.hasFloodRisk ? "浸水想定あり" : "目立った想定なし";
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
    isHazardEvaluated(m.hazard.source)
      ? { label: "災害リスク", value: hazardCardValue(m.hazard), source: m.hazard.source, asOf: m.hazard.asOf, est: false }
      : { label: "災害リスク", value: "対象外", source: m.hazard.source, asOf: m.hazard.asOf, est: false },
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
