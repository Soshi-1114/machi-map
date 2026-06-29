import { describe, it, expect } from "vitest";
import { computeLivability, scoreBandLabel, buildRecommendations } from "@/lib/livabilityScore";
import { muni, metric, hazard } from "../_fixtures";

describe("computeLivability", () => {
  it("有効な軸のみで平均し score(0-100) を算出する", () => {
    // 既定 fixture: 家賃60000(→★2)・待機児童0(→★5)・ハザード評価ありリスクなし(→★5)。
    // amenities なし → アクセス/生活インフラは対象外（null）で母数から除外。
    const liv = computeLivability(muni());
    expect(liv.evaluated).toBe(3);
    expect(liv.total).toBe(5);
    expect(liv.score).toBe(80); // (2+5+5)/3 = 4.0 → 80
    expect(liv.axes.find((a) => a.key === "rent")?.stars).toBe(2);
    expect(liv.axes.find((a) => a.key === "childcare")?.stars).toBe(5);
    expect(liv.axes.find((a) => a.key === "access")?.stars).toBeNull();
  });

  it("家賃が安いほど高評価", () => {
    expect(computeLivability(muni({ rent: metric({ value: 45000 }) })).axes.find((a) => a.key === "rent")?.stars).toBe(5);
    expect(computeLivability(muni({ rent: metric({ value: 70000 }) })).axes.find((a) => a.key === "rent")?.stars).toBe(1);
  });

  it("家賃データなし（0以下）は対象外", () => {
    const liv = computeLivability(muni({ rent: metric({ value: 0 }) }));
    expect(liv.axes.find((a) => a.key === "rent")?.stars).toBeNull();
  });

  it("浸水深が深いほど災害スコアが下がる", () => {
    const high = computeLivability(muni({ hazard: hazard({ floodLevel: 4 }) }));
    expect(high.axes.find((a) => a.key === "disaster")?.stars).toBe(1); // 5 - min(4,4)
  });

  it("ハザード評価対象外は災害が null", () => {
    const liv = computeLivability(muni({ hazard: hazard({ source: "対象外（北方領土）" }) }));
    expect(liv.axes.find((a) => a.key === "disaster")?.stars).toBeNull();
  });

  it("amenities があるとアクセス・生活インフラが点く", () => {
    const liv = computeLivability(
      muni({
        amenities: { stations: 30, preschools: 80, medicalFacilities: 80, source: "reinfolib", asOf: "2024" },
      }),
    );
    expect(liv.axes.find((a) => a.key === "access")?.stars).toBe(5);
    expect(liv.axes.find((a) => a.key === "infrastructure")?.stars).toBe(5);
  });

  it("全指標が対象外なら score は null", () => {
    const liv = computeLivability(
      muni({
        rent: metric({ value: 0 }),
        waitlistChildren: metric({ value: 0, source: "区別非公表（さいたま市）" }),
        hazard: hazard({ source: "対象外（北方領土）" }),
      }),
    );
    expect(liv.score).toBeNull();
    expect(liv.evaluated).toBe(0);
  });
});

describe("scoreBandLabel / buildRecommendations", () => {
  it("スコア帯ラベル", () => {
    expect(scoreBandLabel(90)).toBe("とても住みやすい");
    expect(scoreBandLabel(30)).toBe("個性的");
  });

  it("強み軸からおすすめを導く（無ければ汎用）", () => {
    const liv = computeLivability(muni({ rent: metric({ value: 45000 }) }));
    const recs = buildRecommendations(muni(), liv);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.some((r) => r.axis === "rent")).toBe(true);
  });
});
