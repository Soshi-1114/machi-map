import MapView from "@/components/MapView";
import { listAll } from "@/lib/metrics";

export default async function HomePage() {
  const all = await listAll("saitama");
  return (
    <main style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", overflow: "hidden" }}>
      <MapView all={all} />
    </main>
  );
}
