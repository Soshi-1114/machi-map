import type { Municipality, Metric, HazardInfo } from "@/lib/types";

export function metric(partial: Partial<Metric> = {}): Metric {
  return {
    value: 0,
    unit: "円/月",
    source: "テスト",
    asOf: "2023",
    isEstimated: false,
    ...partial,
  };
}

export function hazard(partial: Partial<HazardInfo> = {}): HazardInfo {
  return {
    hasFloodRisk: false,
    hasLandslideRisk: false,
    note: "",
    source: "国土数値情報（reinfolib XKT026/029）",
    asOf: "2024",
    ...partial,
  };
}

export function muni(partial: Partial<Municipality> = {}): Municipality {
  return {
    code: "11203",
    pref: "saitama",
    name: "川口市",
    population: 600000,
    populationTrend: "横ばい",
    rent: metric({ value: 60000 }),
    landPrice: metric({ value: 200000, unit: "円/㎡" }),
    waitlistChildren: metric({ value: 0, unit: "人" }),
    hazard: hazard(),
    ...partial,
  };
}
