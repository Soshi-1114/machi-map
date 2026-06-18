import MapView from "@/components/MapView";
import { listAll } from "@/lib/metrics";

export default async function HomePage() {
  const all = await listAll("saitama");
  return (
    <main className="app-shell">
      <MapView all={all} />
    </main>
  );
}
