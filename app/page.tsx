import MapView from "@/components/MapView";
import { listAllAcrossPrefs } from "@/lib/metrics";

export default async function HomePage() {
  const all = await listAllAcrossPrefs();
  return (
    <main className="app-shell">
      <MapView all={all} />
    </main>
  );
}
