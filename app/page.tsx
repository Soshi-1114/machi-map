import MapView from "@/components/MapView";
import { listSummaryAcrossPrefs } from "@/lib/metrics";

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
