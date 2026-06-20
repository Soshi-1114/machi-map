import { describe, it, expect } from "vitest";
import { isHazardEvaluated, isAmenitiesCounted } from "@/lib/coverage";
import { isWaitlistDisclosed } from "@/lib/waitlist";
import { hasLandPrice } from "@/lib/landPrice";
import { metric } from "../_fixtures";

describe("isHazardEvaluated", () => {
  it("対象外 / 未評価 は false", () => {
    expect(isHazardEvaluated("対象外（北方領土）")).toBe(false);
    expect(isHazardEvaluated("未評価")).toBe(false);
  });
  it("通常出典は true", () => {
    expect(isHazardEvaluated("国土数値情報（reinfolib XKT026/029）")).toBe(true);
  });
});

describe("isAmenitiesCounted", () => {
  it("対象外 / 未集計 は false", () => {
    expect(isAmenitiesCounted("対象外")).toBe(false);
    expect(isAmenitiesCounted("未集計")).toBe(false);
  });
  it("通常出典は true", () => {
    expect(isAmenitiesCounted("国土数値情報（reinfolib XKT015/007/010）")).toBe(true);
  });
});

describe("isWaitlistDisclosed", () => {
  it("区別非公表 は false", () => {
    expect(isWaitlistDisclosed(metric({ source: "区別非公表（市全体で5人）" }))).toBe(false);
  });
  it("通常は true", () => {
    expect(isWaitlistDisclosed(metric({ source: "こども家庭庁" }))).toBe(true);
  });
});

describe("hasLandPrice", () => {
  it("0 / 負値は欠損", () => {
    expect(hasLandPrice(0)).toBe(false);
    expect(hasLandPrice(-1)).toBe(false);
  });
  it("正値は有効", () => {
    expect(hasLandPrice(150000)).toBe(true);
  });
});
