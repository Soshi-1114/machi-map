// こども家庭庁「保育所等関連状況取りまとめ（令和7年4月1日）」のExcelから、
// 指定都道府県の市区町村別 待機児童数を抽出し、data/{pref}.json に反映する。
// シート「資料６－１/６－２」を読むため「（参考）資料1～6」(_r7_02.xlsx)を使う。
//
// 事前: curl -L -o /tmp/cfa_waitlist.xlsx https://www.cfa.go.jp/.../20250828_policies_hoiku_torimatome_r7_02.xlsx
// 実行: node scripts/fetch-waitlist.mjs --pref=saitama   /   --all（全国1ファイルから全県反映）

import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import XLSX from "xlsx";
import { resolvePrefs } from "./_lib/prefs.mjs";
import { loadMuni, saveMuni } from "./_lib/data.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const prefs = resolvePrefs(process.argv.slice(2));

const XLSX_PATH = process.env.WAITLIST_XLSX ||
  process.argv.find((a) => a.endsWith(".xlsx")) ||
  "/tmp/cfa_waitlist.xlsx";
if (!existsSync(XLSX_PATH)) {
  console.error(`Excel not found: ${XLSX_PATH}`);
  process.exit(1);
}

function extractFromR6(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, raw: true });
  const results = new Map();
  const PREFS = new Set([
    "北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県",
    "茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県",
    "新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県",
    "三重県","滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県",
    "鳥取県","島根県","岡山県","広島県","山口県","徳島県","香川県","愛媛県","高知県",
    "福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県",
  ]);
  for (const r of rows) {
    for (let i = 0; i < r.length - 2; i++) {
      const cell = r[i];
      if (typeof cell !== "string" || !PREFS.has(cell.trim())) continue;
      const muni = r[i + 1]; const r6 = r[i + 2];
      if (typeof muni !== "string" || typeof r6 !== "number") continue;
      results.set(`${cell.trim()}|${String(muni).trim()}`, r6);
    }
  }
  return results;
}

const META = {
  unit: "人",
  source: "こども家庭庁 保育所等関連状況取りまとめ",
  asOf: "2025-04-01",
  isEstimated: false,
};

async function applyPref(pref, all) {
  const targetPref = new Map();
  for (const [k, v] of all) {
    const [p, m] = k.split("|");
    if (p === pref.nameJa) targetPref.set(m, v);
  }

  const { muni, wards, paths } = await loadMuni(ROOT, pref);

  let nonZero = 0, zero = 0;
  for (const m of muni) {
    const v = targetPref.get(m.name);
    if (v != null) { m.waitlistChildren = { value: v, ...META }; nonZero++; }
    else { m.waitlistChildren = { value: 0, ...META }; zero++; }
  }

  // 政令市親が 0 ならば子区も 0、非0なら推計のまま残す
  for (const [parent, children] of Object.entries(pref.parentToWards ?? {})) {
    const p = muni.find((m) => m.code === parent);
    if (!p) continue;
    if (p.waitlistChildren.value === 0) {
      for (const cc of children) {
        const w = wards.find((x) => x.code === cc);
        if (w) w.waitlistChildren = {
          value: 0, unit: "人",
          source: "こども家庭庁 保育所等関連状況取りまとめ（市総合より）",
          asOf: "2025-04-01", isEstimated: false,
        };
      }
    }
  }

  await saveMuni(paths, muni, wards);
  console.log(`${pref.slug}: 待機児童≠0 ${nonZero} / 0 ${zero}`);
}

async function main() {
  const wb = XLSX.readFile(XLSX_PATH);
  const sheets = ["資料６－１", "資料６－２"];
  const all = new Map();
  for (const name of sheets) {
    const ws = wb.Sheets[name]; if (!ws) continue;
    const got = extractFromR6(ws);
    for (const [k, v] of got) all.set(k, v);
    console.log(`  ${name}: ${got.size} entries`);
  }
  // Excel は1回パース。対象 pref 群へまとめて反映（--all で全国1ファイルから全県）。
  for (const pref of prefs) await applyPref(pref, all);
  console.log("data files 保存完了");
}

main().catch((e) => { console.error(e); process.exit(1); });
