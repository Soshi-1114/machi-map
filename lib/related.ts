import type { Municipality } from "./types";
import { hasRent } from "./rentColor";

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

// 家賃と人口規模の両方が近い「似ているエリア」を返す（家賃のみの related と差別化）。
// 各指標を母集団のレンジで正規化し、ユークリッド距離が小さい順。両指標が有効な
// 候補のみを対象にする（推計はしない）。exclude のコードは除外する。
export function findSimilar(
  all: Municipality[],
  target: Municipality,
  limit = 3,
  exclude: Set<string> = new Set(),
): Municipality[] {
  if (!hasRent(target.rent.value) || target.population <= 0) return [];
  const pool = all.filter(
    (m) =>
      m.code !== target.code &&
      !exclude.has(m.code) &&
      hasRent(m.rent.value) &&
      m.population > 0,
  );
  if (pool.length === 0) return [];

  const rents = pool.map((m) => m.rent.value).concat(target.rent.value);
  const pops = pool.map((m) => m.population).concat(target.population);
  const rentRange = Math.max(...rents) - Math.min(...rents) || 1;
  const popRange = Math.max(...pops) - Math.min(...pops) || 1;

  return pool
    .map((m) => {
      const dr = (m.rent.value - target.rent.value) / rentRange;
      const dp = (m.population - target.population) / popRange;
      return { m, dist: Math.hypot(dr, dp) };
    })
    .sort((a, b) => a.dist - b.dist)
    .slice(0, limit)
    .map((x) => x.m);
}
