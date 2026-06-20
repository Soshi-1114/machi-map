// 自治体データのアクセス層。pref 別 JSON を動的 import で読むので、
// 47 県展開時もホームページに全データが乗らない（Next.js のコード分割で必要時のみ）。
//
// シグネチャは将来 reinfolib/e-Stat の直接呼び出しに差し替え可能な形を維持。

import { Municipality, MuniSummary } from "./types";
import { PREFS, getPrefBySlug, getPrefByCode, loadPrefData } from "./prefs";

// pref データのキャッシュ（同一 build/request 内で同じ pref を複数回呼んでも 1 度しかロードしない）
const cache = new Map<string, Promise<{ muni: Municipality[]; wards: Municipality[] }>>();

function loadPref(slug: string) {
  const pref = getPrefBySlug(slug);
  if (!pref) return Promise.resolve({ muni: [], wards: [] });
  let p = cache.get(slug);
  if (!p) {
    p = loadPrefData(pref.slug, pref.hasWards);
    cache.set(slug, p);
  }
  return p;
}

export async function getMunicipality(code: string): Promise<Municipality | null> {
  // code prefix から pref を引き、その pref データだけロード
  const pref = getPrefByCode(code);
  if (!pref) return null;
  const { muni, wards } = await loadPref(pref.slug);
  return muni.find((m) => m.code === code) ?? wards.find((m) => m.code === code) ?? null;
}

export async function listMunicipalities(pref: string): Promise<Municipality[]> {
  return (await loadPref(pref)).muni;
}

export async function listWards(pref: string): Promise<Municipality[]> {
  return (await loadPref(pref)).wards;
}

export async function listAll(pref: string): Promise<Municipality[]> {
  const { muni, wards } = await loadPref(pref);
  return [...muni, ...wards];
}

/** 全 pref を横断して全自治体（市区町村 + 行政区）を返す。sitemap 用。 */
export async function listAllAcrossPrefs(): Promise<Municipality[]> {
  const all: Municipality[] = [];
  for (const p of PREFS) {
    const { muni, wards } = await loadPref(p.slug);
    all.push(...muni, ...wards);
  }
  return all;
}

/**
 * 全 pref 横断の軽量サマリ。トップ地図の初期配信用（検索・色付け・分割に必要な
 * 最小フィールドのみ）。フル Municipality（約1.8MB）を積まずに済む。
 */
export async function listSummaryAcrossPrefs(): Promise<MuniSummary[]> {
  const out: MuniSummary[] = [];
  for (const p of PREFS) {
    const { muni, wards } = await loadPref(p.slug);
    for (const m of [...muni, ...wards]) {
      out.push({
        code: m.code,
        pref: m.pref,
        name: m.name,
        displayName: m.displayName,
        level: m.level,
        parentCode: m.parentCode,
        rent: m.rent.value,
        landPrice: m.landPrice.value,
        populationTrend: m.populationTrend,
        hasFloodRisk: m.hazard.hasFloodRisk,
      });
    }
  }
  return out;
}
