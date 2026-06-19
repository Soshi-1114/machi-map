// こども家庭庁「保育所等関連状況取りまとめ（令和6年4月1日）」のExcelから、
// 埼玉県の市区町村別 待機児童数を抽出し、data/saitama.json の waitlistChildren を更新する。
//
// 事前: curl -L -o /tmp/cfa_waitlist.xlsx \
//   https://www.cfa.go.jp/assets/contents/node/basic_page/field_ref_resources/4ddf7d00-3f9a-4435-93a4-8e6c204db16c/ccac221b/20240829_policies_hoiku_torimatome_r6_03.xlsx
//
// 実行: node scripts/fetch-waitlist.mjs [/path/to/xlsx]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const XLSX_PATH = process.argv[2] || "/tmp/cfa_waitlist.xlsx";
if (!existsSync(XLSX_PATH)) {
  console.error(`Excel not found: ${XLSX_PATH}`);
  console.error(`Download: curl -L -o /tmp/cfa_waitlist.xlsx https://www.cfa.go.jp/assets/contents/node/basic_page/field_ref_resources/4ddf7d00-3f9a-4435-93a4-8e6c204db16c/ccac221b/20240829_policies_hoiku_torimatome_r6_03.xlsx`);
  process.exit(1);
}

// 資料6-1 (減少) と 資料6-2 (増加/変化なし) はカラムレイアウトが異なる。
// 各行から「左ブロック・右ブロック」2組の (都道府県, 市区町村, R6待機児童数) を取り出す。
// 安定化のため、行ごとに "都道府県っぽい文字列" を見つけ、その隣に市区町村、次の数値が R6.4 という前提で走査する。
function extractFromR6(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, raw: true });
  const results = new Map();
  // 都道府県名一覧（簡易判定用）
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
      const muni = r[i + 1];
      const r6 = r[i + 2];
      if (typeof muni !== "string" || typeof r6 !== "number") continue;
      results.set(`${cell.trim()}|${String(muni).trim()}`, r6);
    }
  }
  return results;
}

function loadDataJson(rel) {
  return JSON.parse(require("fs").readFileSync(path.join(ROOT, rel), "utf8"));
}

async function main() {
  const wb = XLSX.readFile(XLSX_PATH);
  const sheets = ["資料６－１", "資料６－２"];
  const all = new Map();
  for (const name of sheets) {
    const ws = wb.Sheets[name];
    if (!ws) { console.warn(`sheet not found: ${name}`); continue; }
    const got = extractFromR6(ws);
    for (const [k, v] of got) all.set(k, v);
    console.log(`  ${name}: ${got.size} entries`);
  }
  console.log(`Total non-zero waitlist munis: ${all.size}`);

  // 埼玉県のみ抽出
  const saitama = new Map();
  for (const [k, v] of all) {
    const [pref, muni] = k.split("|");
    if (pref === "埼玉県") saitama.set(muni, v);
  }
  console.log(`\n埼玉県内 待機児童≠0 の市区町村: ${saitama.size}`);
  for (const [muni, v] of saitama) console.log(`  ${muni}: ${v} 人`);

  // データに反映
  const muniJson = JSON.parse(await fs.readFile(path.join(ROOT, "data/saitama.json"), "utf8"));
  const wards = JSON.parse(await fs.readFile(path.join(ROOT, "data/saitama_wards.json"), "utf8"));

  const META = {
    unit: "人",
    source: "こども家庭庁 保育所等関連状況取りまとめ",
    asOf: "2024-04-01",
    isEstimated: false,
  };

  let updatedZero = 0;
  let updatedNonZero = 0;
  let saitamaCityTotal = null;
  for (const m of muniJson) {
    const v = saitama.get(m.name);
    if (v != null) {
      m.waitlistChildren = { value: v, ...META };
      updatedNonZero++;
    } else {
      m.waitlistChildren = { value: 0, ...META };
      updatedZero++;
    }
    if (m.code === "11100") saitamaCityTotal = m.waitlistChildren.value;
  }
  console.log(`\nsaitama.json: ${updatedNonZero} 自治体に実値、${updatedZero} 自治体は0で実値化`);

  // 政令市の行政区は CFA Excel に内訳が無い。さいたま市総合が 0 ならば全区も 0、
  // 非0 (>0) の場合は内訳不明なため推計のまま残す（is_estimated:true）。
  if (saitamaCityTotal === 0) {
    for (const w of wards) {
      w.waitlistChildren = {
        value: 0,
        unit: "人",
        source: "こども家庭庁 保育所等関連状況取りまとめ（市総合より）",
        asOf: "2024-04-01",
        isEstimated: false,
      };
    }
    console.log("さいたま市総合=0 なので 10 区も 0 で実値化");
  } else {
    console.log(`さいたま市総合=${saitamaCityTotal}、区の内訳は CFA に無いため推計維持`);
  }

  await fs.writeFile(path.join(ROOT, "data/saitama.json"), JSON.stringify(muniJson, null, 2) + "\n");
  await fs.writeFile(path.join(ROOT, "data/saitama_wards.json"), JSON.stringify(wards, null, 2) + "\n");
  console.log("data files 保存完了");
}

main().catch((e) => { console.error(e); process.exit(1); });
