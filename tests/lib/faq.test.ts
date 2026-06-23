import { describe, it, expect } from "vitest";
import { buildFaq, type QA } from "@/lib/faq";
import { muni, metric, hazard } from "../_fixtures";

// 設問キーワードで回答を引く（並び順に依存しないアサーション）。
const ans = (faq: QA[], kw: string): string | undefined =>
  faq.find((x) => x.q.includes(kw))?.a;

const AMENITIES = { stations: 40, preschools: 200, medicalFacilities: 1700, source: "不動産情報ライブラリ", asOf: "2024" };

describe("buildFaq", () => {
  it("データの揃った自治体は総合・家賃・地価・人口・待機児童・災害・液状化・交通・医療・外国人の10問", () => {
    const m = muni({
      name: "川口市",
      population: 600000,
      rent: metric({ value: 62000 }),
      landPrice: metric({ value: 200000, unit: "円/㎡" }),
      waitlistChildren: metric({ value: 0, unit: "人" }),
      hazard: hazard({ hasFloodRisk: true, note: "荒川沿いに浸水想定", liquefactionLevel: 1, liquefactionLabel: "非常に液状化しやすい" }),
      amenities: AMENITIES,
      foreignResidents: metric({ value: 38000, unit: "人", source: "出入国在留管理庁 在留外国人統計", asOf: "2024-12" }),
    });
    const faq = buildFaq(m, "埼玉県");
    expect(faq).toHaveLength(10);
    expect(ans(faq, "住みやすい")).toContain("人口は600,000人");
    expect(ans(faq, "家賃相場")).toContain("62,000円/月");
    expect(ans(faq, "地価")).toContain("200,000円/㎡");
    expect(ans(faq, "人口は何人")).toContain("600,000人");
    expect(ans(faq, "待機児童")).toContain("待機児童ゼロ");
    expect(ans(faq, "災害リスク")).toContain("浸水想定区域は「あり」");
    expect(ans(faq, "液状化")).toContain("非常に液状化しやすい");
    expect(ans(faq, "交通")).toContain("40駅");
    expect(ans(faq, "医療")).toContain("1,700件");
    expect(ans(faq, "外国人住民")).toContain("約6.3%");
  });

  it("段階値データは浸水深・土砂区分を表示", () => {
    const m = muni({
      name: "富山市",
      rent: metric({ value: 60000 }),
      landPrice: metric({ value: 100000, unit: "円/㎡" }),
      hazard: hazard({
        hasFloodRisk: true,
        hasLandslideRisk: true,
        floodLevel: 6,
        landslideLevel: 2,
        note: "浸水想定 最大20m〜（神通川）",
      }),
    });
    const faq = buildFaq(m, "富山県");
    expect(ans(faq, "災害リスク")).toContain("浸水想定区域は最大「20m〜」");
    expect(ans(faq, "災害リスク")).toContain("土砂災害は「特別警戒区域」");
  });

  it("家賃データなしは対象外を明示し、地価なしは設問を出さない", () => {
    const m = muni({
      name: "○○村",
      rent: metric({ value: 0 }),
      landPrice: metric({ value: 0, unit: "円/㎡" }),
    });
    const faq = buildFaq(m, "長野県");
    expect(ans(faq, "家賃相場")).toContain("集計対象外");
    expect(faq.some((x) => x.q.includes("地価"))).toBe(false);
    // 生活インフラ（amenities無し）・液状化（未評価）は設問が出ない
    expect(faq.some((x) => x.q.includes("交通"))).toBe(false);
    expect(faq.some((x) => x.q.includes("液状化"))).toBe(false);
  });

  it("区別非公表の待機児童はその旨を回答", () => {
    const m = muni({
      name: "中央区",
      level: "ward",
      waitlistChildren: metric({ value: 0, unit: "人", source: "区別非公表（さいたま市全体で10人）" }),
    });
    const faq = buildFaq(m, "埼玉県");
    expect(ans(faq, "待機児童")).toContain("区別に公表されていません");
  });

  it("ハザード対象外は理由を添えて回答（液状化設問も出ない）", () => {
    const m = muni({ name: "北方四島", hazard: hazard({ source: "対象外（北方領土）" }) });
    const faq = buildFaq(m, "北海道");
    expect(ans(faq, "災害リスク")).toContain("対象外");
    expect(ans(faq, "災害リスク")).toContain("北方領土");
    expect(faq.some((x) => x.q.includes("液状化"))).toBe(false);
  });

  it("在留外国人統計の対象外は外国人設問を出さない", () => {
    const m = muni({
      name: "色丹村",
      foreignResidents: metric({ value: 0, unit: "人", source: "対象外（北方領土）", asOf: "2024-12" }),
    });
    const faq = buildFaq(m, "北海道");
    expect(faq.some((x) => x.q.includes("外国人住民"))).toBe(false);
  });
});
