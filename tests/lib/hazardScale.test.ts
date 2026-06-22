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
