import { describe, it, expect } from "vitest";
import * as turf from "@turf/turf";
import {
  lng2tileX,
  lat2tileY,
  tileX2lng,
  tileY2lat,
  tileBbox,
  bboxIntersects,
  tilesForPolys,
  pool,
} from "../../scripts/_lib/reinfolib.mjs";

describe("Slippy タイル座標", () => {
  it("経度→タイルX→経度 でタイルが経度を内包する", () => {
    for (const lng of [-179, 0, 139.6917, 179]) {
      const z = 14;
      const x = lng2tileX(lng, z);
      expect(tileX2lng(x, z)).toBeLessThanOrEqual(lng);
      expect(tileX2lng(x + 1, z)).toBeGreaterThan(lng);
    }
  });

  it("緯度→タイルY→緯度 でタイルが緯度を内包する（Yは北で小）", () => {
    for (const lat of [-60, 0, 35.6895, 60]) {
      const z = 14;
      const y = lat2tileY(lat, z);
      expect(tileY2lat(y, z)).toBeGreaterThanOrEqual(lat);
      expect(tileY2lat(y + 1, z)).toBeLessThan(lat);
    }
  });

  it("tileBbox は [w<e, s<n]", () => {
    const [w, s, e, n] = tileBbox(14550, 6449, 14);
    expect(w).toBeLessThan(e);
    expect(s).toBeLessThan(n);
  });
});

describe("bboxIntersects", () => {
  it("重なり/非重なりを判定", () => {
    expect(bboxIntersects([0, 0, 2, 2], [1, 1, 3, 3])).toBe(true);
    expect(bboxIntersects([0, 0, 1, 1], [2, 2, 3, 3])).toBe(false);
    expect(bboxIntersects([0, 0, 1, 1], [1, 1, 2, 2])).toBe(true); // 接触
  });
});

describe("tilesForPolys", () => {
  it("ポリゴンを覆うタイルだけ返す（海上タイルは除外）", () => {
    // 経度139.0〜139.1, 緯度35.0〜35.1 の小さな正方形
    const feat = turf.polygon([[
      [139.0, 35.0], [139.1, 35.0], [139.1, 35.1], [139.0, 35.1], [139.0, 35.0],
    ]]);
    const polys = [{ feat, bbox: turf.bbox(feat) }];
    const z = 13;
    const result = tilesForPolys(polys, z);
    expect(result.length).toBeGreaterThan(0);
    // 返るタイルはすべてポリゴン bbox と交差する
    for (const t of result) {
      expect(bboxIntersects(tileBbox(t.x, t.y, z), polys[0].bbox)).toBe(true);
    }
  });

  it("空ポリゴン集合では空配列", () => {
    expect(tilesForPolys([], 13)).toEqual([]);
  });
});

describe("pool", () => {
  it("全 item を処理する（同時実行数で取りこぼさない）", async () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const seen: number[] = [];
    await pool(items, 4, async (x) => { seen.push(x); });
    expect(seen.sort((a, b) => a - b)).toEqual(items);
  });
});
