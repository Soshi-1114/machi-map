"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Municipality } from "@/lib/types";
import { buildSummary } from "@/lib/summary";
import { MetricCards } from "./AreaPanel";

type Stage = "compact" | "half" | "full";

type Props = {
  municipality: Municipality | null;
  onClose: () => void;
};

// iOS safe-area 分を上乗せ。CSS 側で padding-bottom: env(safe-area-inset-bottom)
// を入れてあるので、コンテンツは safe-area の上に乗る。
const STAGE_HEIGHTS: Record<Stage, string> = {
  compact: "calc(80px + env(safe-area-inset-bottom))",
  half: "calc(360px + env(safe-area-inset-bottom))",
  full: "calc(82vh + env(safe-area-inset-bottom))",
};

// half/full は背景 scrim を出して「読みに集中する」モードに切替
const IS_MODAL: Record<Stage, boolean> = {
  compact: false,
  half: true,
  full: true,
};

export default function MobileSheet({ municipality, onClose }: Props) {
  const [stage, setStage] = useState<Stage>("compact");

  // 自治体が切り替わったら compact に戻す（比較行動の妨げを避ける）
  useEffect(() => {
    setStage("compact");
  }, [municipality?.code]);

  if (!municipality) return null;
  const m = municipality;

  const cycleUp = () => {
    setStage((s) => (s === "compact" ? "half" : s === "half" ? "full" : "compact"));
  };
  const collapse = () => setStage("compact");

  const isExpanded = stage !== "compact";
  const heading = m.displayName ?? m.name;

  return (
    <>
      {IS_MODAL[stage] && (
        <div
          className="sheet-scrim"
          aria-hidden="true"
          onClick={collapse}
        />
      )}
      <div
        className={`sheet sheet-stage-${stage}`}
        style={{ height: STAGE_HEIGHTS[stage] }}
        role="dialog"
        aria-modal={IS_MODAL[stage]}
        aria-label={`${heading}の詳細`}
      >
        <button
          className="sheet-handle-btn"
          aria-label={isExpanded ? "シートを縮める" : "シートを拡大"}
          onClick={cycleUp}
        >
          <span className="sheet-handle" />
        </button>

        {stage === "compact" ? (
          <button className="sheet-compact-row" onClick={cycleUp} aria-label={`${heading}を拡大`}>
            <span className="sheet-compact-name">{heading}</span>
            <span className="sheet-compact-rent">
              <strong>{m.rent.value.toLocaleString()}</strong>円/月
            </span>
            <span className="sheet-compact-chevron" aria-hidden="true">
              <ChevronUp />
            </span>
            <span
              className="sheet-compact-close"
              role="button"
              tabIndex={0}
              aria-label="閉じる"
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onClose(); } }}
            >×</span>
          </button>
        ) : (
          <div className="sheet-content">
            <div className="panel-head-top">
              <div>
                <h2 className="panel-title" style={{ fontSize: 18 }}>{heading}</h2>
                <p className="panel-sub" style={{ margin: "2px 0 0" }}>
                  家賃 <strong style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{m.rent.value.toLocaleString()}</strong> 円/月
                  <span className="trend-chip">{m.populationTrend}</span>
                </p>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button className="panel-close" aria-label="シートを縮める" onClick={collapse}>
                  <ChevronDown />
                </button>
                <button className="panel-close" aria-label="閉じる" onClick={onClose}>×</button>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <MetricCards m={m} />
            </div>

            {stage === "full" && (
              <div style={{ marginTop: 16 }}>
                <div className="summary-block">{buildSummary(m)}</div>
                <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "8px 0" }}>
                  人口 {m.population.toLocaleString()}人
                </p>
                {m.hazard.note && (
                  <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "8px 0" }}>
                    災害メモ: {m.hazard.note}
                  </p>
                )}
                <Link href={`/area/${m.pref}/${m.code}`} className="cta-button">
                  詳細を見る →
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function ChevronUp() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
