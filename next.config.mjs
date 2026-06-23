/** @type {import('next').NextConfig} */

// Content-Security-Policy。全ページに付与する。
//
// 本サイトは SSG（静的HTML）なので nonce 方式（リクエスト毎の nonce を HTML と
// ヘッダの双方に入れる）は使えない。Next のハイドレーション用インラインスクリプトは
// ページごとに内容が変わりグローバルなハッシュ列にもできないため、script-src は
// 'unsafe-inline' を許可する。代わりに object-src/base-uri/frame-ancestors の遮断、
// connect/img の許可ドメイン限定、eval 不許可で実効的な防御を効かせる。
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
