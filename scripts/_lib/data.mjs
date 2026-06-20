// data/{pref}.json（+政令市は {pref}_wards.json）の読み書き共通化。
// 全フェッチスクリプトが同じ 2スペース整形＋末尾改行で書き戻すための単一窓口。

import fs from "node:fs/promises";
import { dataPaths, PREFS, getPref } from "./prefs.mjs";

// 市区町村データを読み込む。
// 返り値: { muni, wards, all, codes, paths }
//   - all は muni/wards と同じ要素参照を含むため、all 経由でも個別配列経由でも
//     同じオブジェクトを書き換えられる（saveMuni には muni / wards を渡す）。
export async function loadMuni(rootDir, pref) {
  const paths = dataPaths(rootDir, pref);
  const muni = JSON.parse(await fs.readFile(paths.muni, "utf8"));
  const wards = paths.wards ? JSON.parse(await fs.readFile(paths.wards, "utf8")) : [];
  const all = [...muni, ...wards];
  return { muni, wards, all, codes: all.map((m) => m.code), paths };
}

// 2スペース整形＋末尾改行で書き戻す。
export async function saveMuni(paths, muni, wards) {
  await fs.writeFile(paths.muni, JSON.stringify(muni, null, 2) + "\n");
  if (paths.wards) await fs.writeFile(paths.wards, JSON.stringify(wards, null, 2) + "\n");
}

// 複数（既定は全47）pref をまとめてロードし、コード→muniオブジェクトの横断 Map を返す。
// e-Stat のような「全国1テーブル」を1リクエスト群でまとめ取得し、各 muni に分配する入口。
// byCode 経由で書き換えた値は entries.{muni,wards} と同一参照なので、entries を saveMuni
// に渡せばそのまま永続化される。
//   返り値: { entries: [{pref, muni, wards, all, paths}], byCode: Map<code, muni>, codes: string[] }
export async function loadAllMuni(rootDir, prefs) {
  const list = prefs ?? Object.keys(PREFS).map((slug) => getPref(slug));
  const entries = [];
  const byCode = new Map();
  for (const pref of list) {
    const { muni, wards, all, paths } = await loadMuni(rootDir, pref);
    entries.push({ pref, muni, wards, all, paths });
    for (const m of all) byCode.set(m.code, m);
  }
  return { entries, byCode, codes: [...byCode.keys()] };
}
