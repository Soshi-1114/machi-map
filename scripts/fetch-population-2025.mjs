// 令和7年(2025)国勢調査 速報集計から、市区町村別の総人口(2025)と
// 5年間(2020→2025)の人口増減率を取得し、data/{pref}.json の
// population と populationTrend を更新する。
//   - 人口:     0004050397（男女別人口）cat01=0(総数)
//   - 増減率:   0004050417 tab=2025_35（5年間の人口増減率, %）
//
// 実行: node --env-file=.env.local scripts/fetch-population-2025.mjs --pref=saitama
//       node --env-file=.env.local scripts/fetch-population-2025.mjs --all

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PREFS, getPref, dataPaths } from "./_lib/prefs.mjs";
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

async function runPref(pref) {
  const paths = dataPaths(ROOT, pref);
  const muni = JSON.parse(await fs.readFile(paths.muni, "utf8"));
  const wards = paths.wards ? JSON.parse(await fs.readFile(paths.wards, "utf8")) : [];
  const all = [...muni, ...wards];
  const codes = all.map((m) => m.code);

  const pop2025 = await fetchValueByArea(APP_ID, POP_2025, codes, { cdCat01: "0" });
  const rate = await fetchValueByArea(APP_ID, CHG_2025, codes, { cdTab: "2025_35" });

  const dist = {};
  let popUpd = 0, trendUpd = 0, miss = 0;
  for (const m of all) {
    const p = pop2025.get(m.code);
    if (p != null) { m.population = p; popUpd++; } else miss++;
    const t = trendOf(rate.get(m.code));
    if (t) { m.populationTrend = t; trendUpd++; dist[t] = (dist[t] || 0) + 1; }
  }
  await fs.writeFile(paths.muni, JSON.stringify(muni, null, 2) + "\n");
  if (paths.wards) await fs.writeFile(paths.wards, JSON.stringify(wards, null, 2) + "\n");
  console.log(`${pref.slug}: pop更新${popUpd}/${all.length}(欠${miss}) trend${trendUpd} | ${JSON.stringify(dist)}`);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--all")) {
    for (const slug of Object.keys(PREFS)) await runPref(getPref(slug));
  } else {
    const a = argv.find((x) => x.startsWith("--pref="));
    const slug = a ? a.slice("--pref=".length) : (argv.includes("--pref") ? argv[argv.indexOf("--pref") + 1] : null);
    if (!slug) { console.error("--pref=<slug> か --all を指定"); process.exit(1); }
    await runPref(getPref(slug));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
