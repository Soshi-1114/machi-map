// e-Stat (政府統計の総合窓口) getStatsData の共通呼び出し。
// cdArea は 1 リクエスト 100 件までのため自動でチャンク分割する（北海道=179自治体など）。

const ESTAT_ENDPOINT = "https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData";

/** ESTAT_APP_ID を取得。未設定なら終了。 */
export function requireEstatAppId() {
  const id = process.env.ESTAT_APP_ID;
  if (!id) { console.error("ESTAT_APP_ID が未設定"); process.exit(1); }
  return id;
}

// e-Stat への一過性の接続失敗（UND_ERR_CONNECT_TIMEOUT 等）を吸収するため、
// リクエスト全体のタイムアウト＋指数バックオフのリトライで包む。
async function fetchJsonWithRetry(url, { attempts = 5, timeoutMs = 30000 } = {}) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ac.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (i < attempts) {
        const backoff = Math.min(1000 * 2 ** (i - 1), 8000);
        console.warn(`e-Stat fetch 失敗 (${i}/${attempts}): ${e.message} — ${backoff}ms 後に再試行`);
        await new Promise((r) => setTimeout(r, backoff));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`e-Stat fetch failed after ${attempts} attempts: ${lastErr?.message ?? lastErr}`);
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
    const data = await fetchJsonWithRetry(url);
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
