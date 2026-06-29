"use client";

// トップの器。PC ではマップ(100dvh ヒーロー)＋その下にリンク帯がスクロールで続く。
// SP ではページをスクロールさせず、マップは全画面のまま。ヘッダーのメニューから
// リンク帯をドロワーとして重ねて表示する（地図のパン操作と競合させない）。
//
// children（HomeLinks）はサーバー側で描画され DOM に常に存在する＝クロール可能。
// SP で閉じている間も display:none にはせず、画面外に退避させるだけにする。

import { useState } from "react";
import type { ReactNode } from "react";
import MapView from "@/components/MapView";
import type { MuniSummary } from "@/lib/types";
import type { MapMetricKey } from "@/lib/mapMetrics";

export default function HomeShell({
  summary,
  children,
  initialMetric,
  navLabel = "エリア・ランキングから探す",
}: {
  summary: MuniSummary[];
  children: ReactNode;
  /** 地図の初期コロプレス指標（ピラーページで "foreignRatio" を指定）。既定は未塗り。 */
  initialMetric?: MapMetricKey | "none";
  navLabel?: string;
}) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className={`home-root ${navOpen ? "is-nav-open" : ""}`}>
      <div className="home-map">
        <MapView summary={summary} onMenuClick={() => setNavOpen(true)} initialMetric={initialMetric} />
      </div>

      <div
        className="home-nav-backdrop"
        onClick={() => setNavOpen(false)}
        aria-hidden="true"
      />

      <aside className="home-links" aria-label={navLabel}>
        <button
          type="button"
          className="home-nav-close"
          aria-label="メニューを閉じる"
          onClick={() => setNavOpen(false)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        {children}
      </aside>
    </div>
  );
}
