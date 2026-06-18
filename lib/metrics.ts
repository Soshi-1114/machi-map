import { Municipality } from "./types";
import saitama from "../data/saitama.json";
import saitamaWards from "../data/saitama_wards.json";

// 市区町村 + 政令市の行政区を統合した検索対象。
// ★将来：これらの中身をreinfolib/e-Stat呼び出しに差し替える。シグネチャは変えない。
const MUNI = saitama as unknown as Municipality[];
const WARDS = saitamaWards as unknown as Municipality[];
const ALL = [...MUNI, ...WARDS];

export async function getMunicipality(code: string): Promise<Municipality | null> {
  return ALL.find((m) => m.code === code) ?? null;
}

export async function listMunicipalities(pref: string): Promise<Municipality[]> {
  return MUNI.filter((m) => m.pref === pref);
}

export async function listWards(pref: string): Promise<Municipality[]> {
  return WARDS.filter((m) => m.pref === pref);
}

export async function listAll(pref: string): Promise<Municipality[]> {
  return ALL.filter((m) => m.pref === pref);
}
