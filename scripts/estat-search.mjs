// e-Stat 統計表検索スクリプト。
// 「国勢調査 市区町村別 人口」 系のテーブル一覧を取得して上位候補を表示。
// 実行: node --env-file=.env.local scripts/estat-search.mjs

const APP_ID = process.env.ESTAT_APP_ID;
if (!APP_ID) {
  console.error("ESTAT_APP_ID が未設定。.env.local を確認");
  process.exit(1);
}

const url = new URL("https://api.e-stat.go.jp/rest/3.0/app/json/getStatsList");
url.searchParams.set("appId", APP_ID);
// 政府統計コード 00200522 = 住宅・土地統計調査
url.searchParams.set("statsCode", "00200522");
url.searchParams.set("searchWord", "１か月当たり家賃 借家");
url.searchParams.set("limit", "50");

const res = await fetch(url);
if (!res.ok) {
  console.error("HTTP", res.status);
  process.exit(1);
}
const data = await res.json();
const list = data.GET_STATS_LIST?.DATALIST_INF?.TABLE_INF ?? [];
const items = Array.isArray(list) ? list : [list];

console.log(`Found ${items.length} tables`);
console.log("---");
for (const t of items.slice(0, 20)) {
  const id = t["@id"];
  const title = t.TITLE?.$ ?? t.TITLE ?? "";
  const survey = t.STATISTICS_NAME ?? "";
  const sub = t.SUB_TITLE ?? "";
  const updated = t.UPDATED_DATE ?? "";
  console.log(`${id}`);
  console.log(`  survey: ${survey}`);
  console.log(`  title : ${title}`);
  if (sub) console.log(`  sub   : ${sub}`);
  console.log(`  updated: ${updated}`);
  console.log("");
}
