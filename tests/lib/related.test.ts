import { describe, it, expect } from "vitest";
import { findRelatedByRent } from "@/lib/related";
import { muni, metric } from "../_fixtures";

describe("findRelatedByRent", () => {
  const target = muni({ code: "00000", rent: metric({ value: 60000 }) });
  const all = [
    target,
    muni({ code: "A", rent: metric({ value: 61000 }) }),
    muni({ code: "B", rent: metric({ value: 50000 }) }),
    muni({ code: "C", rent: metric({ value: 59000 }) }),
    muni({ code: "D", rent: metric({ value: 80000 }) }),
  ];

  it("自身を除外し家賃が近い順に返す", () => {
    const r = findRelatedByRent(all, target);
    expect(r.map((m) => m.code)).toEqual(["A", "C", "B", "D"]);
  });

  it("limit で件数を絞る", () => {
    expect(findRelatedByRent(all, target, 2).map((m) => m.code)).toEqual(["A", "C"]);
  });
});
