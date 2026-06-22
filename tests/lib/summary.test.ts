import { describe, it, expect } from "vitest";
import { buildSummary } from "@/lib/summary";
import { muni, metric, hazard } from "../_fixtures";

describe("buildSummary", () => {
  it("家賃あり・浸水なし・待機児童ゼロ", () => {
    const s = buildSummary(
      muni({
        name: "川口市",
        rent: metric({ value: 60000, unit: "円/月" }),
        waitlistChildren: metric({ value: 0, unit: "人" }),
        hazard: hazard({ hasFloodRisk: false }),
      }),
    );
    expect(s).toBe(
      "川口市は民営借家中央値60,000円/月。目立った浸水想定なし。待機児童ゼロ。",
    );
  });

  it("家賃欠損は『家賃データなし』", () => {
    const s = buildSummary(muni({ rent: metric({ value: 0 }) }));
    expect(s).toContain("家賃データなし");
  });

  it("浸水ありは note を含める", () => {
    const s = buildSummary(
      muni({ hazard: hazard({ hasFloodRisk: true, note: "荒川沿い" }) }),
    );
    expect(s).toContain("浸水想定あり（荒川沿い）");
  });

  it("待機児童 非公表 / 非ゼロ", () => {
    expect(
      buildSummary(
        muni({
          waitlistChildren: metric({
            value: 0,
            source: "区別非公表（さいたま市全体で5人）",
          }),
        }),
      ),
    ).toContain("待機児童は区別非公表");
    expect(
      buildSummary(muni({ waitlistChildren: metric({ value: 12, unit: "人" }) })),
    ).toContain("待機児童12人");
  });

  it("段階値データは浸水深を表示", () => {
    const s = buildSummary(
      muni({ hazard: hazard({ hasFloodRisk: true, floodLevel: 3, note: "x" }) }),
    );
    expect(s).toContain("浸水想定は最大3〜5m");
  });

  it("段階値データ・浸水なしは『目立った浸水想定なし』", () => {
    const s = buildSummary(muni({ hazard: hazard({ floodLevel: 0 }) }));
    expect(s).toContain("目立った浸水想定なし");
  });

  it("ハザード対象外", () => {
    const s = buildSummary(
      muni({ hazard: hazard({ source: "対象外（北方領土）" }) }),
    );
    expect(s).toContain("ハザード評価は対象外");
  });

  it("displayName を優先", () => {
    const s = buildSummary(muni({ name: "浦和区", displayName: "さいたま市浦和区" }));
    expect(s.startsWith("さいたま市浦和区は")).toBe(true);
  });
});
