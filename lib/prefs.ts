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
async function loadKanagawa() {
  const muni = (await import("../data/kanagawa.json")).default as Municipality[];
  const wards = (await import("../data/kanagawa_wards.json")).default as Municipality[];
  return { muni, wards };
}
async function loadYamanashi() {
  const muni = (await import("../data/yamanashi.json")).default as Municipality[];
  return { muni, wards: [] };
}
async function loadNagano() {
  const muni = (await import("../data/nagano.json")).default as Municipality[];
  return { muni, wards: [] };
}
async function loadGifu() {
  const muni = (await import("../data/gifu.json")).default as Municipality[];
  return { muni, wards: [] };
}
async function loadShizuoka() {
  const muni = (await import("../data/shizuoka.json")).default as Municipality[];
  const wards = (await import("../data/shizuoka_wards.json")).default as Municipality[];
  return { muni, wards };
}
async function loadAichi() {
  const muni = (await import("../data/aichi.json")).default as Municipality[];
  const wards = (await import("../data/aichi_wards.json")).default as Municipality[];
  return { muni, wards };
}
async function loadMie() {
  const muni = (await import("../data/mie.json")).default as Municipality[];
  return { muni, wards: [] };
}
async function loadShiga() {
  const muni = (await import("../data/shiga.json")).default as Municipality[];
  return { muni, wards: [] };
}
async function loadKyoto() {
  const muni = (await import("../data/kyoto.json")).default as Municipality[];
  const wards = (await import("../data/kyoto_wards.json")).default as Municipality[];
  return { muni, wards };
}
async function loadOsaka() {
  const muni = (await import("../data/osaka.json")).default as Municipality[];
  const wards = (await import("../data/osaka_wards.json")).default as Municipality[];
  return { muni, wards };
}
async function loadHyogo() {
  const muni = (await import("../data/hyogo.json")).default as Municipality[];
  const wards = (await import("../data/hyogo_wards.json")).default as Municipality[];
  return { muni, wards };
}
async function loadNara() {
  const muni = (await import("../data/nara.json")).default as Municipality[];
  return { muni, wards: [] };
}
async function loadWakayama() {
  const muni = (await import("../data/wakayama.json")).default as Municipality[];
  return { muni, wards: [] };
}
async function loadTottori() {
  const muni = (await import("../data/tottori.json")).default as Municipality[];
  return { muni, wards: [] };
}
async function loadShimane() {
  const muni = (await import("../data/shimane.json")).default as Municipality[];
  return { muni, wards: [] };
}
async function loadOkayama() {
  const muni = (await import("../data/okayama.json")).default as Municipality[];
  const wards = (await import("../data/okayama_wards.json")).default as Municipality[];
  return { muni, wards };
}

export const PREFS: PrefEntry[] = [
  { slug: "saitama",  nameJa: "埼玉県",   codePrefix: "11", hasWards: true,  load: loadSaitama },
  { slug: "chiba",    nameJa: "千葉県",   codePrefix: "12", hasWards: true,  load: loadChiba },
  { slug: "gunma",    nameJa: "群馬県",   codePrefix: "10", hasWards: false, load: loadGunma },
  { slug: "tochigi",  nameJa: "栃木県",   codePrefix: "09", hasWards: false, load: loadTochigi },
  { slug: "ibaraki",  nameJa: "茨城県",   codePrefix: "08", hasWards: false, load: loadIbaraki },
  { slug: "tokyo",    nameJa: "東京都",   codePrefix: "13", hasWards: false, load: loadTokyo },
  { slug: "kanagawa", nameJa: "神奈川県", codePrefix: "14", hasWards: true,  load: loadKanagawa },
  { slug: "yamanashi", nameJa: "山梨県",  codePrefix: "19", hasWards: false, load: loadYamanashi },
  { slug: "nagano",    nameJa: "長野県",  codePrefix: "20", hasWards: false, load: loadNagano },
  { slug: "gifu",      nameJa: "岐阜県",  codePrefix: "21", hasWards: false, load: loadGifu },
  { slug: "shizuoka",  nameJa: "静岡県",  codePrefix: "22", hasWards: true,  load: loadShizuoka },
  { slug: "aichi",     nameJa: "愛知県",  codePrefix: "23", hasWards: true,  load: loadAichi },
  { slug: "mie",       nameJa: "三重県",  codePrefix: "24", hasWards: false, load: loadMie },
  { slug: "shiga",     nameJa: "滋賀県",  codePrefix: "25", hasWards: false, load: loadShiga },
  { slug: "kyoto",     nameJa: "京都府",  codePrefix: "26", hasWards: true,  load: loadKyoto },
  { slug: "osaka",     nameJa: "大阪府",  codePrefix: "27", hasWards: true,  load: loadOsaka },
  { slug: "hyogo",     nameJa: "兵庫県",  codePrefix: "28", hasWards: true,  load: loadHyogo },
  { slug: "nara",      nameJa: "奈良県",  codePrefix: "29", hasWards: false, load: loadNara },
  { slug: "wakayama",  nameJa: "和歌山県", codePrefix: "30", hasWards: false, load: loadWakayama },
  { slug: "tottori",   nameJa: "鳥取県",  codePrefix: "31", hasWards: false, load: loadTottori },
  { slug: "shimane",   nameJa: "島根県",  codePrefix: "32", hasWards: false, load: loadShimane },
  { slug: "okayama",   nameJa: "岡山県",  codePrefix: "33", hasWards: true,  load: loadOkayama },
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
