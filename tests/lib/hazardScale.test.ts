import { describe, it, expect } from "vitest";
import type { HazardInfo } from "@/lib/types";
import {
  floodLevelOf,
  landslideLevelOf,
  floodGraded,
  floodLevelLabel,
  landslideLevelLabel,
  floodColor,
  HAZARD_NODATA_COLOR,
  FLOOD_COLORS,
  FLOOD_MAX_LEVEL,
  bandLowerMeters,
  depthRank,
  tsunamiLevelOf,
  stormSurgeLevelOf,
  coastalHazardLabel,
  liquefactionLevelOf,
  liquefactionLabel,
  liquefactionIsRisk,
} from "@/lib/hazardScale";

const base: HazardInfo = {
  hasFloodRisk: false,
  hasLandslideRisk: false,
  note: "",
  source: "国土数値情報（reinfolib XKT026/029）",
  asOf: "2024",
};

describe("floodLevelOf / landslideLevelOf", () => {
  it("新データの段階値をそのまま返す", () => {
    const h = { ...base, floodLevel: 3, landslideLevel: 2 };
    expect(floodLevelOf(h)).toBe(3);
    expect(landslideLevelOf(h)).toBe(2);
  });

  it("旧データ（boolean のみ）は presence 0/1 にフォールバック", () => {
    expect(floodLevelOf({ ...base, hasFloodRisk: true })).toBe(1);
    expect(floodLevelOf({ ...base, hasFloodRisk: false })).toBe(0);
    expect(landslideLevelOf({ ...base, hasLandslideRisk: true })).toBe(1);
  });

  it("評価対象外は -1（boolean が false でも『なし』としない）", () => {
    const oos = { ...base, source: "対象外（北方領土・ハザード評価対象外）" };
    expect(floodLevelOf(oos)).toBe(-1);
    expect(landslideLevelOf(oos)).toBe(-1);
  });

  it("段階値は boolean より優先される", () => {
    expect(floodLevelOf({ ...base, hasFloodRisk: false, floodLevel: 5 })).toBe(5);
  });
});

describe("floodGraded", () => {
  it("段階値を持つかで分岐する", () => {
    expect(floodGraded({ ...base, floodLevel: 0 })).toBe(true);
    expect(floodGraded({ ...base, hasFloodRisk: true })).toBe(false);
  });
});

describe("floodLevelLabel", () => {
  it("段階ごとの深さラベル", () => {
    expect(floodLevelLabel(0)).toBe("浸水なし");
    expect(floodLevelLabel(3)).toBe("3〜5m");
    expect(floodLevelLabel(6)).toBe("20m〜");
  });
  it("対象外は『対象外』", () => {
    expect(floodLevelLabel(-1)).toBe("対象外");
  });
  it("上限超えはクランプ", () => {
    expect(floodLevelLabel(99)).toBe(floodLevelLabel(FLOOD_MAX_LEVEL));
  });
});

describe("landslideLevelLabel", () => {
  it("警戒/特別警戒の区分", () => {
    expect(landslideLevelLabel(0)).toBe("該当なし");
    expect(landslideLevelLabel(1)).toBe("警戒区域");
    expect(landslideLevelLabel(2)).toBe("特別警戒区域");
    expect(landslideLevelLabel(-1)).toBe("対象外");
  });
});

describe("floodColor", () => {
  it("level に応じた amber ランプ", () => {
    expect(floodColor(0)).toBe(FLOOD_COLORS[0]);
    expect(floodColor(6)).toBe(FLOOD_COLORS[6]);
  });
  it("対象外は nodata 色", () => {
    expect(floodColor(-1)).toBe(HAZARD_NODATA_COLOR);
  });
});

describe("bandLowerMeters（津波・高潮の深さバンド下限）", () => {
  it("書式違いの両方から下限mを抽出", () => {
    expect(bandLowerMeters("0.3m以上 ～ 1m未満")).toBe(0.3); // 津波書式
    expect(bandLowerMeters("1m以上3m未満")).toBe(1);         // 高潮書式
    expect(bandLowerMeters("5m以上 ～ 10m未満")).toBe(5);
    expect(bandLowerMeters("20m以上")).toBe(20);
  });
  it("『〜未満』のみ（下限なし）は 0", () => {
    expect(bandLowerMeters("0.3m未満")).toBe(0);
    expect(bandLowerMeters("")).toBe(0);
  });
});

describe("depthRank（下限m→ランク1..8）", () => {
  it("深いほど大きいランク", () => {
    expect(depthRank(0)).toBe(1);    // 〜0.3m
    expect(depthRank(0.3)).toBe(2);
    expect(depthRank(1)).toBe(3);
    expect(depthRank(3)).toBe(5);
    expect(depthRank(20)).toBe(8);
  });
});

describe("津波・高潮アクセサと表示", () => {
  const base = {
    hasFloodRisk: false, hasLandslideRisk: false, note: "", source: "x", asOf: "2024",
  };
  it("level 未設定（旧データ）は -1（未評価）", () => {
    expect(tsunamiLevelOf({ ...base })).toBe(-1);
    expect(stormSurgeLevelOf({ ...base })).toBe(-1);
  });
  it("coastalHazardLabel: -1=対象外 / 0=想定なし / >=1=最大バンド", () => {
    expect(coastalHazardLabel(-1)).toBe("対象外");
    expect(coastalHazardLabel(0)).toBe("想定なし");
    expect(coastalHazardLabel(7, "10m以上 ～ 15m未満")).toBe("最大 10m以上 ～ 15m未満");
    expect(coastalHazardLabel(3)).toBe("想定あり"); // depth 欠落時
  });
});

describe("液状化（レベルは小さいほど高リスク）", () => {
  const base = {
    hasFloodRisk: false, hasLandslideRisk: false, note: "", source: "x", asOf: "2024",
  };
  it("level 未設定（メッシュなし/旧データ）は -1（未評価）", () => {
    expect(liquefactionLevelOf({ ...base })).toBe(-1);
    expect(liquefactionLevelOf({ ...base, liquefactionLevel: 1 })).toBe(1);
  });
  it("label は note 優先、欠落時はフォールバック表", () => {
    expect(liquefactionLabel(-1)).toBe("対象外");
    expect(liquefactionLabel(1, "非常に液状化しやすい")).toBe("非常に液状化しやすい");
    expect(liquefactionLabel(2)).toBe("液状化しやすい"); // フォールバック
  });
  it("is-risk は level 1..3（やや以上）のみ", () => {
    expect(liquefactionIsRisk(1)).toBe(true);
    expect(liquefactionIsRisk(3)).toBe(true);
    expect(liquefactionIsRisk(5)).toBe(false); // 液状化しにくい
    expect(liquefactionIsRisk(-1)).toBe(false);
  });
});
