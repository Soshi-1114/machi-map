// Hero 右カラムの「住みやすさ総合スコア」。総合点＋5段階星＋5軸の内訳を表示。
// スコアは実データ指標のみから算出（lib/livabilityScore.ts）。対象外指標は「データなし」。
import type { Livability } from "@/lib/livabilityScore";
import { scoreBandLabel } from "@/lib/livabilityScore";
import { Stars } from "./Stars";
import { Info, TrainFront, Wallet, Baby, ShieldCheck, Building2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AxisKey } from "@/lib/livabilityScore";

const AXIS_ICON: Record<AxisKey, LucideIcon> = {
  access: TrainFront,
  rent: Wallet,
  childcare: Baby,
  disaster: ShieldCheck,
  infrastructure: Building2,
};

export function ScorePanel({ liv }: { liv: Livability }) {
  return (
    <div className="ad-score">
      <span className="ad-score-caption">住みやすさ総合スコア</span>
      {liv.score !== null ? (
        <>
          <p className="ad-score-number">
            <strong>{liv.score}</strong>
            <span className="ad-score-max">/100</span>
          </p>
          <div className="ad-score-band">
            <Stars value={liv.stars} size={22} />
            <span className="ad-score-band-label">{scoreBandLabel(liv.score)}</span>
          </div>
        </>
      ) : (
        <p className="ad-score-number is-nodata">算出対象外</p>
      )}

      <ul className="ad-score-axes">
        {liv.axes.map((a) => {
          const Icon = AXIS_ICON[a.key];
          return (
            <li key={a.key} className="ad-score-axis">
              <span className="ad-score-axis-label">
                <Icon size={16} aria-hidden="true" />
                {a.label}
              </span>
              {a.stars !== null ? (
                <Stars value={a.stars} size={14} />
              ) : (
                <span className="ad-score-axis-na">データなし</span>
              )}
            </li>
          );
        })}
      </ul>

      <p className="ad-score-foot">
        <Info size={13} aria-hidden="true" />
        実データの{liv.evaluated}/{liv.total}指標から算出した目安です。
      </p>
    </div>
  );
}
