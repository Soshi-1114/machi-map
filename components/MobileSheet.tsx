"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Municipality } from "@/lib/types";
import { buildSummary } from "@/lib/summary";
import { MetricCards } from "./AreaPanel";

type Stage = "half" | "full";

type Props = {
  municipality: Municipality | null;
  onClose: () => void;
};

// half: persistent / 200px、full: modal / 60vh。+ iOS safe-area。
const STAGE_HEIGHTS: Record<Stage, string> = {
  half: "calc(200px + env(safe-area-inset-bottom))",
  full: "calc(60vh + env(safe-area-inset-bottom))",
};

const IS_MODAL: Record<Stage, boolean> = {
  half: false,
  full: true,
};

// half→full / full→half スナップしきい値
const SNAP_UP_THRESHOLD = 70;   // half でこれ以上上にスワイプで full
const SNAP_DOWN_THRESHOLD = 100; // full でこれ以上下にスワイプで half

export default function MobileSheet({ municipality, onClose }: Props) {
  const [stage, setStage] = useState<Stage>("half");
  // 上方向 = -, 下方向 = + のドラッグ量
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartY = useRef<number | null>(null);

  useEffect(() => {
    setStage("half");
    setDragOffset(0);
  }, [municipality?.code]);

  if (!municipality) return null;
  const m = municipality;

  const toggle = () => setStage((s) => (s === "half" ? "full" : "half"));
  const collapse = () => setStage("half");
  const expand = () => setStage("full");

  // 双方向ドラッグ: half では上方向のみ、full では下方向のみ受け付ける
  const onTouchStart = (e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    if (stage === "half") {
      setDragOffset(Math.min(0, dy)); // 上 (-) のみ
    } else {
      setDragOffset(Math.max(0, dy)); // 下 (+) のみ
    }
  };
  const onTouchEnd = () => {
    if (dragStartY.current === null) return;
    if (stage === "half" && dragOffset < -SNAP_UP_THRESHOLD) {
      setStage("full");
    } else if (stage === "full" && dragOffset > SNAP_DOWN_THRESHOLD) {
      setStage("half");
    }
    setDragOffset(0);
    dragStartY.current = null;
  };

  const heading = m.displayName ?? m.name;

  // ドラッグ中の動的な高さ計算
  let heightStyle = STAGE_HEIGHTS[stage];
  if (stage === "half" && dragOffset < 0) {
    heightStyle = `calc(${STAGE_HEIGHTS.half} + ${-dragOffset}px)`;
  } else if (stage === "full" && dragOffset > 0) {
    heightStyle = `calc(${STAGE_HEIGHTS.full} - ${dragOffset}px)`;
  }

  // scrim は full スナップ完了後にだけ出す。
  // ドラッグ中（dragOffset !== 0）は scrim を出さない方が地図が見える。
  const showScrim = IS_MODAL[stage] && dragOffset === 0;
  // ドラッグ中の scrim opacity 補間（より自然な遷移）
  const scrimIntensity =
    stage === "full" && dragOffset > 0
      ? Math.max(0, 1 - dragOffset / 200)
      : stage === "half" && dragOffset < 0
      ? Math.min(1, -dragOffset / 150)
      : showScrim
      ? 1
      : 0;

  return (
    <>
      {scrimIntensity > 0.01 && (
        <div
          className="sheet-scrim"
          aria-hidden="true"
          onClick={collapse}
          style={{ opacity: scrimIntensity * 0.32 }}
        />
      )}
      <div
        className={`sheet sheet-stage-${stage}${dragOffset !== 0 ? " is-dragging" : ""}`}
        style={{ height: heightStyle }}
        role="dialog"
        aria-modal={IS_MODAL[stage]}
        aria-label={`${heading}の詳細`}
      >
        {/* ハンドル + スワイプ受付エリア。タップでも toggle */}
        <div
          className="sheet-handle-wrap"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          <button
            className="sheet-handle-btn"
            aria-label={stage === "full" ? "シートを縮める" : "シートを拡大"}
            onClick={toggle}
          >
            <span className="sheet-handle" />
          </button>
        </div>

        <div className="sheet-content">
          <div className="panel-head-top">
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2 className="panel-title" style={{ fontSize: 17 }}>{heading}</h2>
              <p className="panel-sub" style={{ margin: "2px 0 0" }}>
                家賃 <strong style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{m.rent.value.toLocaleString()}</strong> 円/月
                <span className="trend-chip">{m.populationTrend}</span>
              </p>
            </div>
            <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
              <button
                className="panel-close"
                aria-label={stage === "full" ? "シートを縮める" : "シートを拡大"}
                onClick={stage === "full" ? collapse : expand}
              >
                {stage === "full" ? <ChevronDown /> : <ChevronUp />}
              </button>
              <button className="panel-close" aria-label="閉じる" onClick={onClose}>×</button>
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <MetricCards m={m} />
          </div>

          {stage === "full" && (
            <div style={{ marginTop: 14 }}>
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
