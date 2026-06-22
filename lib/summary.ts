import type { Municipality } from "./types";
import { isWaitlistDisclosed } from "./waitlist";
import { isHazardEvaluated } from "./coverage";
import { floodLevelOf, floodGraded, floodLevelLabel } from "./hazardScale";

// 将来はLLM生成に差し替える前提。シグネチャを変えないこと。
export function buildSummary(m: Municipality): string {
  const name = m.displayName ?? m.name;
  // 民営借家中央値が 0/未満は住宅統計の集計対象外（データなし）。
  const rent =
    m.rent.value > 0
      ? `民営借家中央値${m.rent.value.toLocaleString()}${m.rent.unit}`
      : "家賃データなし";
  const wait = !isWaitlistDisclosed(m.waitlistChildren)
    ? "待機児童は区別非公表"
    : m.waitlistChildren.value > 0
      ? `待機児童${m.waitlistChildren.value}人`
      : "待機児童ゼロ";
  const hazard = !isHazardEvaluated(m.hazard.source)
    ? "ハザード評価は対象外"
    : floodGraded(m.hazard)
      ? floodLevelOf(m.hazard) > 0
        ? `浸水想定は最大${floodLevelLabel(floodLevelOf(m.hazard))}`
        : "目立った浸水想定なし"
      : m.hazard.hasFloodRisk
        ? `浸水想定あり（${m.hazard.note}）`
        : "目立った浸水想定なし";
  return `${name}は${rent}。${hazard}。${wait}。`;
}
