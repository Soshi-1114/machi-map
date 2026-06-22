import { describe, it, expect } from "vitest";
import {
  HAZARD_OVERLAYS,
  DEFAULT_HAZARD_KEY,
  getHazardOverlay,
} from "@/lib/mapHazards";

describe("mapHazards", () => {
  it("4種別（浸水/津波/高潮/液状化）を持つ", () => {
    expect(HAZARD_OVERLAYS.map((h) => h.key)).toEqual([
      "flood", "tsunami", "stormSurge", "liquefaction",
    ]);
  });

  it("既定は浸水", () => {
    expect(DEFAULT_HAZARD_KEY).toBe("flood");
  });

  it("getHazardOverlay: none は null、種別は定義を返す", () => {
    expect(getHazardOverlay("none")).toBeNull();
    expect(getHazardOverlay("tsunami")?.prop).toBe("tsunamiLevel");
    expect(getHazardOverlay("liquefaction")?.prop).toBe("liquefactionLevel");
  });

  it("各種別は filter / opacity 式と凡例を持つ", () => {
    for (const h of HAZARD_OVERLAYS) {
      expect(Array.isArray(h.filter)).toBe(true);
      expect(Array.isArray(h.opacity)).toBe(true);
      expect(h.legend.length).toBeGreaterThan(0);
    }
  });

  it("液状化は presence を 1..3（やや以上）に限定する（逆順レベル）", () => {
    const liq = getHazardOverlay("liquefaction")!;
    const json = JSON.stringify(liq.filter);
    expect(json).toContain("liquefactionLevel");
    expect(json).toContain("<="); // 上限 3 の句がある
  });
});
