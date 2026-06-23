// IndexNow へ URL を一括送信し、Bing / Yandex / Seznam 等に即時クロールを促す。
// Google は IndexNow 非対応（Search Console 側で発見）だが、Bing 系は AI 検索
// （Copilot / ChatGPT 連携）の母体でもあるため早期インデックスの価値が大きい。
//
// 仕組み: 所有権確認用のキーを公開ファイルとして配置済み
//   public/{INDEXNOW_KEY}.txt（内容は同じキー文字列）→ https://{host}/{key}.txt
// で配信される。IndexNow はこのファイルを取得してキー一致を確認する。
//
// 重要: キーファイルが本番に**デプロイ済み**でないと検証に失敗する。
//   新しい URL を反映する流れ:（1）main にマージ →（2）本番デプロイ →
//   （3）本スクリプトを実行（公開中の sitemap.xml の URL を送信）。
//
// 使い方:
//   node scripts/indexnow-submit.mjs                 # 公開 sitemap.xml の全URLを送信
//   node scripts/indexnow-submit.mjs --dry-run       # 送信せず対象URLだけ表示
//   node scripts/indexnow-submit.mjs --url=https://kurashimap.jp/area/saitama/11203  # 個別URL
//   node scripts/indexnow-submit.mjs --host=kurashimap.jp

const KEY = "538ebed6e4254171636c18b0583f02eb"; // public/{KEY}.txt と一致させること
const HOST =
  (process.argv.find((a) => a.startsWith("--host=")) || "").split("=")[1] ||
  "kurashimap.jp";
const ENDPOINT = "https://api.indexnow.org/indexnow"; // 参加エンジンへ自動転送
const SITEMAP_URL = `https://${HOST}/sitemap.xml`;
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const BATCH = 10000; // IndexNow の 1 リクエスト上限
const DRY = process.argv.includes("--dry-run");

// --url=... で指定された URL（複数可）。無ければ sitemap.xml から収集する。
function explicitUrls() {
  return process.argv
    .filter((a) => a.startsWith("--url="))
    .map((a) => a.slice("--url=".length))
    .filter(Boolean);
}

async function urlsFromSitemap() {
  const res = await fetch(SITEMAP_URL, { headers: { "user-agent": "kurashimap-indexnow" } });
  if (!res.ok) throw new Error(`sitemap 取得失敗: ${res.status} ${SITEMAP_URL}`);
  const xml = await res.text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  // 念のため対象ホストの URL のみに絞る（IndexNow はホスト不一致を拒否する）。
  return locs.filter((u) => {
    try { return new URL(u).host === HOST; } catch { return false; }
  });
}

async function submit(urlList) {
  const body = { host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList };
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  // IndexNow: 200=受理 / 202=受理(検証待ち) / 400=不正 / 403=キー不一致 / 422=URL不一致 / 429=多すぎ
  const text = await res.text().catch(() => "");
  return { status: res.status, text };
}

async function main() {
  const urls = explicitUrls();
  const list = urls.length ? urls : await urlsFromSitemap();
  if (!list.length) {
    console.error("送信対象 URL が 0 件です。");
    process.exit(1);
  }
  console.log(`host=${HOST} / key=${KEY} / 対象 ${list.length} URL`);
  console.log(`keyLocation=${KEY_LOCATION}`);
  if (DRY) {
    for (const u of list.slice(0, 20)) console.log("  " + u);
    if (list.length > 20) console.log(`  …他 ${list.length - 20} 件`);
    console.log("(--dry-run のため送信しません)");
    return;
  }
  for (let i = 0; i < list.length; i += BATCH) {
    const chunk = list.slice(i, i + BATCH);
    const { status, text } = await submit(chunk);
    console.log(`送信 ${i + 1}–${i + chunk.length}: HTTP ${status}${text ? ` ${text.slice(0, 200)}` : ""}`);
    if (status >= 400) {
      console.error("IndexNow がエラーを返しました。キーファイルが本番に配信済みか確認してください:", KEY_LOCATION);
      process.exit(1);
    }
  }
  console.log("IndexNow 送信完了");
}

main().catch((e) => { console.error(e); process.exit(1); });
