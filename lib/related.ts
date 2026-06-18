import type { Municipality } from "./types";

// 家賃中央値が近い順に並べ、自身を除いた上位 N 件を返す。
// 将来的には地価・人口・距離など複数指標で similarity を計算するよう拡張可。
export function findRelatedByRent(
  all: Municipality[],
  target: Municipality,
  limit = 5,
): Municipality[] {
  return all
    .filter((m) => m.code !== target.code)
    .map((m) => ({ m, diff: Math.abs(m.rent.value - target.rent.value) }))
    .sort((a, b) => a.diff - b.diff)
    .slice(0, limit)
    .map((x) => x.m);
}
