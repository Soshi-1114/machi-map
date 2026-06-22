import { describe, it, expect } from "vitest";
import {
  HAZARD_OVERLAYS,
  DEFAULT_HAZARD_KEY,
  getHazardOverlay,
} from "@/lib/mapHazards";

describe("mapHazards", () => {
  it("5種別（浸水/土砂/津波/高潮/液状化）を持つ", () => {
    expect(HAZARD_OVERLAYS.map((h) => h.key)).toEqual([
      "flood", "landslide", "tsunami", "stormSurge", "liquefaction",
    ]);
  });

  it("既定はオーバーレイなし", () => {
    expect(DEFAULT_HAZARD_KEY).toBe("none");
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
      expect(h.gsiLayerIds.length).toBeGreaterThan(0);
    }
  });

  it("土砂は GSI 3レイヤー（土石流/急傾斜/地すべり）を重ねる", () => {
    expect(getHazardOverlay("landslide")?.gsiLayerIds).toEqual([
      "05_dosekiryukeikaikuiki", "05_kyukeishakeikaikuiki", "05_jisuberikeikaikuiki",
    ]);
  });

  it("液状化は presence を 1..3（やや以上）に限定する（逆順レベル）", () => {
    const liq = getHazardOverlay("liquefaction")!;
    const json = JSON.stringify(liq.filter);
    expect(json).toContain("liquefactionLevel");
    expect(json).toContain("<="); // 上限 3 の句がある
  });
});
