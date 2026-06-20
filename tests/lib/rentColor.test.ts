import { describe, it, expect } from "vitest";
import {
  hasRent,
  rentColor,
  rentStepExpression,
  RENT_COLORS,
  RENT_NODATA_COLOR,
} from "@/lib/rentColor";

describe("hasRent", () => {
  it("0 / 負値は欠損", () => {
    expect(hasRent(0)).toBe(false);
    expect(hasRent(-1)).toBe(false);
  });
  it("正値は有効", () => {
    expect(hasRent(1)).toBe(true);
    expect(hasRent(60000)).toBe(true);
  });
});

describe("rentColor 境界", () => {
  it("欠損はグレー", () => {
    expect(rentColor(0)).toBe(RENT_NODATA_COLOR);
    expect(rentColor(-100)).toBe(RENT_NODATA_COLOR);
  });
  it("5段階の境界（< 比較）", () => {
    expect(rentColor(49999)).toBe(RENT_COLORS[0]);
    expect(rentColor(50000)).toBe(RENT_COLORS[1]);
    expect(rentColor(54999)).toBe(RENT_COLORS[1]);
    expect(rentColor(55000)).toBe(RENT_COLORS[2]);
    expect(rentColor(59999)).toBe(RENT_COLORS[2]);
    expect(rentColor(60000)).toBe(RENT_COLORS[3]);
    expect(rentColor(64999)).toBe(RENT_COLORS[3]);
    expect(rentColor(65000)).toBe(RENT_COLORS[4]);
    expect(rentColor(999999)).toBe(RENT_COLORS[4]);
  });
});

describe("rentStepExpression", () => {
  it("case 式で欠損→グレー分岐を持つ", () => {
    const expr = rentStepExpression() as unknown[];
    expect(Array.isArray(expr)).toBe(true);
    expect(expr[0]).toBe("case");
    expect(expr).toContain(RENT_NODATA_COLOR);
  });
});
