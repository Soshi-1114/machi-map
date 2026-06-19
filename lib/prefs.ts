// 対応都道府県マニフェスト。
// 新規県を追加する時はここに entry を 1 行足し、data/{slug}.json と
// （政令市があれば）data/{slug}_wards.json + public/{slug}.geojson + 必要なら
// public/{slug}_wards.geojson を準備する。
//
// loader は動的 import を返すため、各 pref データは Next.js のコード分割で
// 必要時のみ chunk に積まれる（全 47 県の JSON がホームページに乗らない）。

import type { Municipality } from "./types";

type Loader = () => Promise<{
  muni: Municipality[];
  wards: Municipality[];
}>;

export type PrefEntry = {
  slug: string;
  nameJa: string;
  /** 全国地方公共団体コードの先頭 2 桁 */
  codePrefix: string;
  /** 政令市の行政区 wards.json を持っているか */
  hasWards: boolean;
  load: Loader;
};

async function loadSaitama() {
  const muni = (await import("../data/saitama.json")).default as Municipality[];
  const wards = (await import("../data/saitama_wards.json")).default as Municipality[];
  return { muni, wards };
}
async function loadChiba() {
  const muni = (await import("../data/chiba.json")).default as Municipality[];
  const wards = (await import("../data/chiba_wards.json")).default as Municipality[];
  return { muni, wards };
}
async function loadGunma() {
  const muni = (await import("../data/gunma.json")).default as Municipality[];
  return { muni, wards: [] };
}
async function loadTochigi() {
  const muni = (await import("../data/tochigi.json")).default as Municipality[];
  return { muni, wards: [] };
}
async function loadIbaraki() {
  const muni = (await import("../data/ibaraki.json")).default as Municipality[];
  return { muni, wards: [] };
}
async function loadTokyo() {
  const muni = (await import("../data/tokyo.json")).default as Municipality[];
  return { muni, wards: [] };
}

export const PREFS: PrefEntry[] = [
  { slug: "saitama", nameJa: "埼玉県", codePrefix: "11", hasWards: true,  load: loadSaitama },
  { slug: "chiba",   nameJa: "千葉県", codePrefix: "12", hasWards: true,  load: loadChiba },
  { slug: "gunma",   nameJa: "群馬県", codePrefix: "10", hasWards: false, load: loadGunma },
  { slug: "tochigi", nameJa: "栃木県", codePrefix: "09", hasWards: false, load: loadTochigi },
  { slug: "ibaraki", nameJa: "茨城県", codePrefix: "08", hasWards: false, load: loadIbaraki },
  { slug: "tokyo",   nameJa: "東京都", codePrefix: "13", hasWards: false, load: loadTokyo },
];

const BY_SLUG = new Map(PREFS.map((p) => [p.slug, p]));
const BY_PREFIX = new Map(PREFS.map((p) => [p.codePrefix, p]));

export function getPrefBySlug(slug: string): PrefEntry | null {
  return BY_SLUG.get(slug) ?? null;
}

/** 自治体コード（5桁）の先頭 2 桁から pref を引く */
export function getPrefByCode(code: string): PrefEntry | null {
  return BY_PREFIX.get(code.slice(0, 2)) ?? null;
}

export function listPrefSlugs(): string[] {
  return PREFS.map((p) => p.slug);
}
