import type { Municipality } from "./types";

// 将来はLLM生成に差し替える前提。シグネチャを変えないこと。
export function buildSummary(m: Municipality): string {
  const name = m.displayName ?? m.name;
  // 民営借家中央値が 0/未満は住宅統計の集計対象外（データなし）。
  const rent =
    m.rent.value > 0
      ? `民営借家中央値${m.rent.value.toLocaleString()}${m.rent.unit}`
      : "家賃データなし";
  const wait =
    m.waitlistChildren.value > 0
      ? `待機児童${m.waitlistChildren.value}人`
      : "待機児童ゼロ";
  const hazard = m.hazard.hasFloodRisk
    ? `浸水想定あり（${m.hazard.note}）`
    : "目立った浸水想定なし";
  return `${name}は${rent}。${hazard}。${wait}。`;
}
