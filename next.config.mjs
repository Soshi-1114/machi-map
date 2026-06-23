/** @type {import('next').NextConfig} */

// Content-Security-Policy。全ページに付与する。これがサイトの CSP の唯一の出所
// （single source of truth）。以前 vercel.json に併存していた Report-Only の CSP
// （'unsafe-eval' を許可し本ポリシーと不整合だった）は削除済み。
//
// 本サイトは SSG（静的HTML）なので nonce 方式（リクエスト毎の nonce を HTML と
// ヘッダの双方に入れる）は使えない。Next のハイドレーション用インラインスクリプトは
// ページごとに内容が変わり（ビルド出力の各ページに src なしの <script> が複数あることを
// 確認済み）グローバルなハッシュ列にもできないため、script-src は 'unsafe-inline' を
// 許可せざるを得ない。なお 'unsafe-inline' が在ると CSP3 仕様によりハッシュ/nonce は
// 無視されるため、GA 初期化スクリプトのハッシュ追加では緩和できない（外せない理由が
// Next のインラインに在るため）。代わりに 'unsafe-eval' は不許可とし、object-src /
// base-uri / frame-ancestors の遮断、connect/img の許可ドメイン限定で実効防御を効かせる。
// 将来 nonce 化するには対象ページを動的レンダリング＋middleware 化する必要があり、
// SSG の配信特性とのトレードオフになる。
//
// 許可ドメイン:
//   - tiles.openfreemap.org … 基盤地図(positron)の style/タイル(pbf)/スプライト/グリフ
//   - *.gsi.go.jp           … 淡色地図(cyberjapandata)・ハザードタイル(disaportaldata)
//   - *.googletagmanager.com / *.google-analytics.com … GA4(gtag.js / collect)
// blob: は MapLibre GL が WebWorker を blob URL で生成するために worker-src で必須。
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tiles.openfreemap.org https://*.gsi.go.jp https://www.googletagmanager.com https://www.google-analytics.com",
  "connect-src 'self' https://tiles.openfreemap.org https://*.gsi.go.jp https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com",
  "font-src 'self' data:",
  "worker-src blob:",
  "child-src blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "Content-Security-Policy", value: csp }],
      },
    ];
  },
};

export default nextConfig;
