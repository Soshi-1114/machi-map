import { describe, it, expect } from "vitest";
import {
  SHELTER_BITS,
  HAZARD_TO_SHELTER_BITS,
  shelterMatchesHazard,
  hasShelterData,
  siteToFeature,
  entryToFeatureCollection,
  SHELTER_SOURCE,
  SHELTER_NODATA,
  type ShelterSite,
} from "@/lib/shelters";

// 洪水+内水のフラグを持つ点（浸水避難に有効）
const floodSite: ShelterSite = {
  name: "○○小学校", address: "市内1-2-3", lng: 139.6, lat: 35.8,
  h: SHELTER_BITS.flood | SHELTER_BITS.inlandFlood | SHELTER_BITS.earthquake,
};
// 津波のみ対応の点
const tsunamiSite: ShelterSite = {
  name: "△△高台", lng: 140.1, lat: 35.2, h: SHELTER_BITS.tsunami | SHELTER_BITS.earthquake,
};

describe("shelters: 災害種別マッピング", () => {
  it("浸水オーバーレイは洪水または内水フラグに対応", () => {
    expect(HAZARD_TO_SHELTER_BITS.flood).toBe(SHELTER_BITS.flood | SHELTER_BITS.inlandFlood);
    expect(shelterMatchesHazard(SHELTER_BITS.flood, "flood")).toBe(true);
    expect(shelterMatchesHazard(SHELTER_BITS.inlandFlood, "flood")).toBe(true);
    expect(shelterMatchesHazard(SHELTER_BITS.tsunami, "flood")).toBe(false);
  });

  it("高潮→高潮フラグ / 津波→津波フラグ / 土砂→崖崩れフラグ", () => {
    expect(shelterMatchesHazard(SHELTER_BITS.highTide, "stormSurge")).toBe(true);
    expect(shelterMatchesHazard(SHELTER_BITS.tsunami, "tsunami")).toBe(true);
    expect(shelterMatchesHazard(SHELTER_BITS.landslide, "landslide")).toBe(true);
  });

  it("液状化は地震フラグで代替する（避難場所に液状化種別が無いため）", () => {
    expect(HAZARD_TO_SHELTER_BITS.liquefaction).toBe(SHELTER_BITS.earthquake);
    expect(shelterMatchesHazard(SHELTER_BITS.earthquake, "liquefaction")).toBe(true);
    expect(shelterMatchesHazard(SHELTER_BITS.flood, "liquefaction")).toBe(false);
  });
});

describe("shelters: 収録判定（honesty）", () => {
  it("出典ありは true、未収録/対象外センチネルは false", () => {
    expect(hasShelterData(SHELTER_SOURCE)).toBe(true);
    expect(hasShelterData(SHELTER_NODATA)).toBe(false);
    expect(hasShelterData("対象外（離島）")).toBe(false);
    expect(hasShelterData("")).toBe(false);
  });
});

describe("shelters: Feature 変換", () => {
  it("オーバーレイ種別ごとの真偽を properties に展開する", () => {
    const f = siteToFeature(floodSite);
    expect(f.geometry.coordinates).toEqual([139.6, 35.8]);
    expect(f.properties.flood).toBe(true);
    expect(f.properties.tsunami).toBe(false);
    expect(f.properties.liquefaction).toBe(true); // earthquake フラグ由来
    expect(f.properties.name).toBe("○○小学校");
  });

  it("FeatureCollection に全点を変換し、種別フィルタが効く形になる", () => {
    const fc = entryToFeatureCollection({ source: SHELTER_SOURCE, asOf: "2025", sites: [floodSite, tsunamiSite] });
    expect(fc.features).toHaveLength(2);
    const tsunamiOnly = fc.features.filter((x) => x.properties.tsunami);
    expect(tsunamiOnly).toHaveLength(1);
    expect(tsunamiOnly[0].properties.name).toBe("△△高台");
  });
});
