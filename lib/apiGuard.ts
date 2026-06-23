// ランタイム API（OG 画像生成・muni JSON・タイルプロキシ）の共通ガード。
// edge ランタイム互換（Node API 非依存）。
//
// 目的: これらの応答はいずれも「デプロイ時に確定し、再デプロイでしか変わらない」
// 静的コンテンツである。にもかかわらず動的関数なので、無防備だとリクエストごとに
// サーバ側レンダリング（特に next/og の ImageResponse は CPU 集約的）が走り、
// コスト枯渇／DoS の増幅経路になる（診断レポート #2）。
//
// コード側で効く防御は2つ:
//   1) クエリ文字列による キャッシュバスティング を安価に棄却する。
//      Vercel/CDN のキャッシュキーは完全 URL（クエリ含む）なので、?x=1, ?x=2 …は
//      すべてキャッシュミス＝再レンダリングになる。レンダリング前に 400 を返せば
//      増幅を断てる。正規の OG/データ URL はクエリを一切付けないため副作用なし。
//   2) 不正フォーマットの入力を、重いデータロード／レンダリングの前に弾く。
//
// 本質的なレート制限（IP 単位の上限）はアプリ層ではなく WAF 層の責務。
// 本番では Vercel Firewall のレート制限を併用すること:
//   https://vercel.com/docs/security/vercel-waf/rate-limiting

/** 全国地方公共団体コード（市区町村・行政区）= 5 桁数字。 */
export const MUNI_CODE_RE = /^\d{5}$/;

/** 県スラッグ = 英小文字のみ。 */
export const PREF_SLUG_RE = /^[a-z]+$/;

/** ランキング指標スラッグ = 英小文字とハイフン。 */
export const METRIC_SLUG_RE = /^[a-z-]+$/;

/**
 * クエリ文字列付きリクエストを安価に弾く。これらのエンドポイントはパスパラメータのみで
 * 一意に定まり、クエリは無意味かつキャッシュバスティングにしか使われない。
 * クエリがあれば 400 を返す Response、無ければ null。
 */
export function rejectQueryBusting(req: Request): Response | null {
  const qIndex = req.url.indexOf("?");
  if (qIndex !== -1 && qIndex < req.url.length - 1) {
    return new Response("query string not allowed", {
      status: 400,
      headers: { "Cache-Control": "public, max-age=86400" },
    });
  }
  return null;
}

// OG 画像のキャッシュヘッダ。コンテンツは再デプロイ時のみ変化し、デプロイで CDN は
// 自動パージされるため immutable + 長い s-maxage が正しい。これにより各 URL は
// 1 デプロイあたり高々 1 回しかレンダリングされず（以後は CDN ヒット）、
// 全コード総当たり攻撃でも origin 負荷が有界になる。
export const OG_IMAGE_HEADERS = {
  "Cache-Control":
    "public, max-age=86400, s-maxage=31536000, immutable, stale-while-revalidate=604800",
} as const;

// muni JSON データのキャッシュヘッダ。同じく再デプロイでのみ変化。ブラウザ側は
// 控えめ（1h）にしつつ CDN を長期化し、SWR で再生成中も応答を返す。
export const DATA_JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control":
    "public, max-age=3600, s-maxage=31536000, stale-while-revalidate=86400",
} as const;
