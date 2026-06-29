import { describe, it, expect } from "vitest";
import {
  HAZARD_OVERLAYS,
  DEFAULT_HAZARD_KEY,
  getHazardOverlay,
  INUNDATION_KEYS,
  isInundationKey,
} from "@/lib/mapHazards";

describe("mapHazards", () => {
  it("4種別（浸水/土砂/津波/高潮）を持つ", () => {
    // 液状化は実区域タイルを安定取得できず地図に出ないため選択肢から除外している。
    expect(HAZARD_OVERLAYS.map((h) => h.key)).toEqual([
      "flood", "landslide", "tsunami", "stormSurge",
    ]);
  });

  it("既定はオーバーレイなし", () => {
    expect(DEFAULT_HAZARD_KEY).toBe("none");
  });

  it("getHazardOverlay: none と除外種別は null、現役種別は定義を返す", () => {
    expect(getHazardOverlay("none")).toBeNull();
    expect(getHazardOverlay("tsunami")?.prop).toBe("tsunamiLevel");
    // 選択肢から外した液状化は定義を持たない（型キーは shelters 用に残る）。
    expect(getHazardOverlay("liquefaction")).toBeNull();
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

  it("浸水深の共通スケール種別（浸水/津波/高潮）を排他判定できる", () => {
    // 国の同一「浸水深」配色のため、この3種だけが排他選択の対象。
    expect([...INUNDATION_KEYS]).toEqual(["flood", "tsunami", "stormSurge"]);
    expect(isInundationKey("flood")).toBe(true);
    expect(isInundationKey("tsunami")).toBe(true);
    expect(isInundationKey("stormSurge")).toBe(true);
    expect(isInundationKey("landslide")).toBe(false);
    expect(isInundationKey("shelter")).toBe(false);
  });
});
