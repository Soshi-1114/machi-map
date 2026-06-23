import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { SITE, absoluteUrl } from "@/lib/site";
import { jsonLdHtml } from "@/lib/jsonLd";
import WebVitals from "@/components/WebVitals";
import "./globals.css";

// Google Analytics 4 の測定ID（gtag.js による閲覧トラッキング）。
const GA_MEASUREMENT_ID = "G-HL76L0RDWK";

// サイト共通のメタデフォルト。各ページ（area/ranking）は title・description・canonical を
// 上書きする。ここは主にトップページと、明示指定のないページのフォールバックを担う。
export const metadata: Metadata = {
  metadataBase: new URL(SITE.baseUrl),
  title: `${SITE.name}｜市区町村の住みやすさを地図で比較`,
  description: SITE.description,
  applicationName: SITE.name,
  openGraph: {
    type: "website",
    locale: SITE.locale,
    siteName: SITE.name,
    url: SITE.baseUrl,
  },
  twitter: { card: "summary_large_image" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

// iOS Safari の safe-area-inset を有効化（ホームインジケータの下までUIを引き伸ばす）
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: SITE.brandColor,
};

// サイト全体のエンティティ（WebSite / 運営者）。検索エンジンに「何のサイトか・誰の発行か」を
// 機械可読で伝える。各ページ固有の BreadcrumbList/ItemList とは別の script として全ページに出す。
const siteLdJson = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": absoluteUrl("/#org"),
      name: SITE.name,
      url: SITE.baseUrl,
      description: SITE.description,
    },
    {
      "@type": "WebSite",
      "@id": absoluteUrl("/#website"),
      url: SITE.baseUrl,
      name: SITE.name,
      description: SITE.description,
      inLanguage: "ja",
      publisher: { "@id": absoluteUrl("/#org") },
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${SITE.baseUrl}/search?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        {/* Google tag (gtag.js) — GA4 閲覧トラッキング。
            重いライブラリ本体(~167KB)は lazyOnload にし、初期表示のクリティカル窓
            （低速回線の帯域・メインスレッド）から外す。下の gtag-init は afterInteractive
            のまま window.gtag/dataLayer を早期に定義するので、ライブラリ到着前に発火する
            計測（web-vitals 等）も dataLayer にキューされ、ロード後にまとめて送信される。 */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
          strategy="lazyOnload"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}');
          `}
        </Script>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdHtml(siteLdJson) }}
        />
        <WebVitals />
        {children}
      </body>
    </html>
  );
}
