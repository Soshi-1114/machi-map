// e-Stat (政府統計の総合窓口) getStatsData の共通呼び出し。
// cdArea は 1 リクエスト 100 件までのため自動でチャンク分割する（北海道=179自治体など）。

const ESTAT_ENDPOINT = "https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData";

/** ESTAT_APP_ID を取得。未設定なら終了。 */
export function requireEstatAppId() {
  const id = process.env.ESTAT_APP_ID;
  if (!id) { console.error("ESTAT_APP_ID が未設定"); process.exit(1); }
  return id;
}

// getStatsData を 100 area/リクエストで分割取得し、VALUE 行を素のまま
// （{"@area","@cat01","$",...}）配列で返す。集計方法は呼び出し側に委ねる。
export async function fetchStatsValues(appId, statsDataId, codes, extraParams = {}) {
  const rows = [];
  for (let i = 0; i < codes.length; i += 100) {
    const chunk = codes.slice(i, i + 100);
    const url = new URL(ESTAT_ENDPOINT);
    url.searchParams.set("appId", appId);
    url.searchParams.set("statsDataId", statsDataId);
    url.searchParams.set("cdArea", chunk.join(","));
    for (const [k, v] of Object.entries(extraParams)) url.searchParams.set(k, v);
    url.searchParams.set("limit", "100000");
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const values = data.GET_STATS_DATA?.STATISTICAL_DATA?.DATA_INF?.VALUE ?? [];
    for (const v of Array.isArray(values) ? values : [values]) rows.push(v);
  }
  return rows;
}

// 単一値メトリクス向け: area コード -> 数値 の Map を返す。数値化できない行は除外。
export async function fetchValueByArea(appId, statsDataId, codes, extraParams = {}) {
  const byCode = new Map();
  for (const v of await fetchStatsValues(appId, statsDataId, codes, extraParams)) {
    const n = Number(v["$"]);
    if (!Number.isNaN(n)) byCode.set(v["@area"], n);
  }
  return byCode;
}
