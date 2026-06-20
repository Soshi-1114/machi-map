import { describe, it, expect } from "vitest";
import { getPrefBySlug, getPrefByCode, listPrefSlugs, PREFS } from "@/lib/prefs";

describe("PREFS マニフェスト", () => {
  it("47 都道府県", () => {
    expect(PREFS.length).toBe(47);
    expect(listPrefSlugs().length).toBe(47);
  });
  it("slug / codePrefix は一意", () => {
    expect(new Set(PREFS.map((p) => p.slug)).size).toBe(47);
    expect(new Set(PREFS.map((p) => p.codePrefix)).size).toBe(47);
  });
});

describe("getPrefBySlug", () => {
  it("既知 slug", () => {
    expect(getPrefBySlug("saitama")?.codePrefix).toBe("11");
  });
  it("未知 slug は null", () => {
    expect(getPrefBySlug("atlantis")).toBeNull();
  });
});

describe("getPrefByCode", () => {
  it("5桁コードの先頭2桁で引く", () => {
    expect(getPrefByCode("11203")?.slug).toBe("saitama");
    expect(getPrefByCode("01100")?.slug).toBe("hokkaido");
    expect(getPrefByCode("13104")?.slug).toBe("tokyo");
  });
  it("未知コードは null", () => {
    expect(getPrefByCode("99999")).toBeNull();
  });
});
