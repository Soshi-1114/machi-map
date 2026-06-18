import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MachiMap",
  description: "市区町村の住みやすさを地図で横断比較するサービス",
};

// iOS Safari の safe-area-inset を有効化（ホームインジケータの下までUIを引き伸ばす）
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#2563eb",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
