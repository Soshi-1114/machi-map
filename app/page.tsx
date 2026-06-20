import type { Metadata } from "next";
import MapView from "@/components/MapView";
import { listSummaryAcrossPrefs } from "@/lib/metrics";
import { SITE, absoluteUrl } from "@/lib/site";

const HOME_TITLE = "市区町村の住みやすさを地図で比較｜家賃・地価・子育て・災害リスク｜KurashiMap";
const HOME_DESC =
  "全国1,918市区町村の家賃相場・地価・人口・待機児童・災害リスクを地図で横断比較できる無料サービス。政府統計の実データだけを使い、推計値は使いません。気になる街の住みやすさをまとめてチェック。";

export const metadata: Metadata = {
  title: HOME_TITLE,
  description: HOME_DESC,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: absoluteUrl("/"),
    siteName: SITE.name,
    title: HOME_TITLE,
    description: HOME_DESC,
  },
  twitter: { card: "summary_large_image", title: HOME_TITLE, description: HOME_DESC },
};

export default async function HomePage() {
  // 初期配信は軽量サマリのみ（検索・地図色付け用）。各自治体の詳細は
  // 選択時に /api/muni/[code] で取得する。
  const summary = await listSummaryAcrossPrefs();
  return (
    <main className="app-shell">
      <MapView summary={summary} />
    </main>
  );
}
