// 令和7年(2025)国勢調査 速報集計から、市区町村別の総人口(2025)と
// 5年間(2020→2025)の人口増減率を取得し、data/{pref}.json の
// population と populationTrend を更新する。
//   - 人口:     0004050397（男女別人口）cat01=0(総数)
//   - 増減率:   0004050417 tab=2025_35（5年間の人口増減率, %）
//
// 実行: node --env-file=.env.local scripts/fetch-population-2025.mjs --pref=saitama
//       node --env-file=.env.local scripts/fetch-population-2025.mjs --all

import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePrefs } from "./_lib/prefs.mjs";
import { loadAllMuni, saveMuni } from "./_lib/data.mjs";
import { requireEstatAppId, fetchValueByArea } from "./_lib/estat.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const APP_ID = requireEstatAppId();

const POP_2025 = "0004050397"; // 令和7年 速報 男女別人口
const CHG_2025 = "0004050417"; // 令和7年 速報 5年間の人口増減率ほか

// 5年(2020→2025)の人口増減率(%)からトレンド5区分へ
function trendOf(ratePct) {
  if (ratePct == null || Number.isNaN(ratePct)) return null;
  if (ratePct >= 3) return "増加";
  if (ratePct >= 1) return "微増";
  if (ratePct > -1) return "横ばい";
  if (ratePct > -3) return "微減";
  return "減少";
}

async function main() {
  // 対象 pref 群の全コードを 1 リクエスト群（estat 側で100件チャンク）でまとめ取得し、
  // 各 muni に分配する。--all なら全国 ~1900 自治体を ~19req/指標で取得（県別ループより
  // 接続回数・冗長を大幅削減）。
  const prefs = resolvePrefs(process.argv.slice(2));
  const { entries, byCode, codes } = await loadAllMuni(ROOT, prefs);
  console.log(`対象 ${prefs.length}県 / ${codes.length}自治体 を一括取得`);

  const pop2025 = await fetchValueByArea(APP_ID, POP_2025, codes, { cdCat01: "0" });
  const rate = await fetchValueByArea(APP_ID, CHG_2025, codes, { cdTab: "2025_35" });

  const dist = {};
  let popUpd = 0, trendUpd = 0, miss = 0;
  for (const [code, m] of byCode) {
    const p = pop2025.get(code);
    if (p != null) { m.population = p; popUpd++; } else miss++;
    const t = trendOf(rate.get(code));
    if (t) { m.populationTrend = t; trendUpd++; dist[t] = (dist[t] || 0) + 1; }
  }
  for (const { paths, muni, wards } of entries) await saveMuni(paths, muni, wards);
  console.log(`pop更新${popUpd}/${byCode.size}(欠${miss}) trend${trendUpd} | ${JSON.stringify(dist)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
