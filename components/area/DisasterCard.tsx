// 災害リスクカード。数値ラベルに加え、種別ごとのリスクレベルを5段階の amber スター
// （多いほど高リスク = Warning カラー）で可視化する。評価対象外は NoData にフォールバック。
import { Star, Droplets, Mountain, Waves, Wind, Layers, Info } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Municipality } from "@/lib/types";
import { isHazardEvaluated, coverageReason } from "@/lib/coverage";
import {
  floodLevelOf,
  floodGraded,
  floodLevelLabel,
  landslideLevelOf,
  landslideGraded,
  landslideLevelLabel,
  tsunamiLevelOf,
  stormSurgeLevelOf,
  coastalHazardLabel,
  liquefactionLevelOf,
  liquefactionLabel,
  liquefactionIsRisk,
} from "@/lib/hazardScale";
import { NoData, SourceLine } from "./cards";

function RiskMeter({ risk, label }: { risk: number; label: string }) {
  return (
    <span className="ad-risk" role="img" aria-label={`${label}のリスクは5段階中 ${risk}`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Star
          key={i}
          size={15}
          strokeWidth={1.5}
          className={i < risk ? "ad-risk-on" : "ad-risk-off"}
        />
      ))}
    </span>
  );
}

type Row = { icon: LucideIcon; label: string; risk: number; text: string };

function buildRows(m: Municipality): Row[] {
  const h = m.hazard;
  const rows: Row[] = [];

  const flood = floodLevelOf(h);
  rows.push({
    icon: Droplets,
    label: floodGraded(h) ? "洪水浸水想定" : "浸水想定区域",
    risk: Math.min(flood, 5),
    text: floodGraded(h) ? floodLevelLabel(flood) : h.hasFloodRisk ? "あり" : "なし",
  });

  const land = landslideLevelOf(h);
  rows.push({
    icon: Mountain,
    label: "土砂災害",
    risk: land === 2 ? 5 : land === 1 ? 3 : 0,
    text: landslideGraded(h) ? landslideLevelLabel(land) : h.hasLandslideRisk ? "あり" : "なし",
  });

  const tsunami = tsunamiLevelOf(h);
  if (tsunami >= 0) {
    rows.push({
      icon: Waves,
      label: "津波浸水想定",
      risk: tsunami > 0 ? Math.min(Math.ceil((tsunami / 8) * 5), 5) : 0,
      text: coastalHazardLabel(tsunami, h.tsunamiDepth),
    });
  }

  const storm = stormSurgeLevelOf(h);
  if (storm >= 0) {
    rows.push({
      icon: Wind,
      label: "高潮浸水想定",
      risk: storm > 0 ? Math.min(Math.ceil((storm / 8) * 5), 5) : 0,
      text: coastalHazardLabel(storm, h.stormSurgeDepth),
    });
  }

  const liq = liquefactionLevelOf(h);
  if (liq >= 1) {
    // liq は小さいほど高リスク（1=非常にしやすい）。risk = 6 - liq を 0..5 にクランプ。
    rows.push({
      icon: Layers,
      label: "液状化の傾向",
      risk: liquefactionIsRisk(liq) ? Math.min(6 - liq, 5) : 1,
      text: liquefactionLabel(liq, h.liquefactionLabel),
    });
  }

  return rows;
}

export function DisasterCard({ m }: { m: Municipality }) {
  if (!isHazardEvaluated(m.hazard.source)) {
    return <NoData text="ハザード評価は対象外です。" reason={coverageReason(m.hazard.source)} />;
  }
  const rows = buildRows(m);
  return (
    <div className="ad-hazard">
      <ul className="ad-hazard-list">
        {rows.map((r) => {
          const Icon = r.icon;
          return (
            <li key={r.label} className={`ad-hazard-row ${r.risk > 0 ? "is-risk" : ""}`}>
              <span className="ad-hazard-icon" aria-hidden="true">
                <Icon size={18} />
              </span>
              <span className="ad-hazard-label">{r.label}</span>
              <RiskMeter risk={r.risk} label={r.label} />
              <span className="ad-hazard-value">{r.text}</span>
            </li>
          );
        })}
      </ul>
      {m.hazard.note && (
        <p className="ad-hazard-note">
          <Info size={15} aria-hidden="true" />
          {m.hazard.note}
        </p>
      )}
      <SourceLine source={m.hazard.source} asOf={m.hazard.asOf} />
    </div>
  );
}
