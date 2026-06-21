import { describe, it, expect } from "vitest";
import { buildFaq } from "@/lib/faq";
import { muni, metric, hazard } from "../_fixtures";

describe("buildFaq", () => {
  it("データのある自治体は家賃・待機児童・災害・地価の4問", () => {
    const m = muni({
      name: "川口市",
      rent: metric({ value: 62000 }),
      landPrice: metric({ value: 200000, unit: "円/㎡" }),
      waitlistChildren: metric({ value: 0, unit: "人" }),
      hazard: hazard({ hasFloodRisk: true, note: "荒川沿いに浸水想定" }),
    });
    const faq = buildFaq(m, "埼玉県");
    expect(faq).toHaveLength(4);
    expect(faq[0].a).toContain("62,000円/月");
    expect(faq[1].a).toContain("待機児童ゼロ");
    expect(faq[2].a).toContain("浸水想定区域は「あり」");
    expect(faq[2].a).toContain("荒川沿いに浸水想定");
    expect(faq[3].a).toContain("200,000円/㎡");
  });

  it("家賃データなしは対象外を明示し、地価なしは設問を出さない", () => {
    const m = muni({
      name: "○○村",
      rent: metric({ value: 0 }),
      landPrice: metric({ value: 0, unit: "円/㎡" }),
    });
    const faq = buildFaq(m, "長野県");
    expect(faq).toHaveLength(3); // 地価の設問が出ない
    expect(faq[0].a).toContain("集計対象外");
    expect(faq.some((x) => x.q.includes("地価"))).toBe(false);
  });

  it("区別非公表の待機児童はその旨を回答", () => {
    const m = muni({
      name: "中央区",
      level: "ward",
      waitlistChildren: metric({ value: 0, unit: "人", source: "区別非公表（さいたま市全体で10人）" }),
    });
    const faq = buildFaq(m, "埼玉県");
    expect(faq[1].a).toContain("区別に公表されていません");
  });

  it("ハザード対象外は理由を添えて回答", () => {
    const m = muni({ name: "北方四島", hazard: hazard({ source: "対象外（北方領土）" }) });
    const faq = buildFaq(m, "北海道");
    expect(faq[2].a).toContain("対象外");
    expect(faq[2].a).toContain("北方領土");
  });
});
