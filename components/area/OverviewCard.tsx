// 「AIによるエリア総評」＋「こんな人におすすめ」。文面はルールベースで実データの
// 軸スコアから生成（lib/livabilityScore.ts）。LLM 生成ではない旨をラベルで明示する。
import { Sparkles, Check } from "lucide-react";
import type { Municipality } from "@/lib/types";
import type { Livability } from "@/lib/livabilityScore";
import { buildOverview, buildRecommendations } from "@/lib/livabilityScore";

export function OverviewCard({ m, liv }: { m: Municipality; liv: Livability }) {
  const overview = buildOverview(m, liv);
  const recs = buildRecommendations(m, liv);
  return (
    <div className="ad-overview">
      <div className="ad-overview-block">
        <span className="ad-overview-tag">
          <Sparkles size={16} aria-hidden="true" />
          エリア総評
        </span>
        <p className="ad-overview-text">{overview}</p>
      </div>
      <div className="ad-overview-block">
        <span className="ad-overview-subhead">こんな人におすすめ</span>
        <ul className="ad-overview-recs">
          {recs.map((r) => (
            <li key={r.text} className="ad-overview-rec">
              <Check size={16} aria-hidden="true" />
              {r.text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
