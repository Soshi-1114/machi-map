"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Municipality } from "@/lib/types";
import { buildSummary } from "@/lib/summary";
import { hasRent } from "@/lib/rentColor";
import { MetricCards } from "./AreaPanel";

type Stage = "peek" | "half" | "full";

type Props = {
  municipality: Municipality | null;
  onClose: () => void;
};

// 3段ボトムシート: peek=最小化(地図優先) / half=主要指標(既定) / full=全情報(モーダル)。
// シート高は full 固定にして transform: translateY で段を切替える。height アニメと違い
// ドラッグ中の再レイアウトが無く GPU 合成で滑らか（旧実装の height 駆動を置換）。
const STAGE_ORDER: readonly Stage[] = ["peek", "half", "full"];
const PEEK_PX = 96;   // ハンドル＋自治体名＋家賃の1行が収まる高さ
// half の高さは「自治体名＋指標カード」の実コンテンツ高に合わせて実測する（余白を出さない）。
// これは計測前の初期値で、実測値（halfPx state）が入るまでのフォールバック。
const HALF_PX_FALLBACK = 236;
const SHEET_HEIGHT = "calc(72vh + env(safe-area-inset-bottom))"; // 固定高（=full）

// full の実ピクセル高（translate 計算用）。CSS の 72vh とは厳密一致しないが、
// full の translate は常に 0 になるため見た目の整合は保たれる。
function fullPx(): number {
  const h = typeof window !== "undefined" ? window.innerHeight : 800;
  return Math.round(h * 0.72);
}
function stageHeightPx(stage: Stage, halfPx: number): number {
  if (stage === "peek") return PEEK_PX;
  if (stage === "half") return halfPx;
  return fullPx();
}
// 段ごとの translateY（0=full 全表示, 値が大きいほど下に隠れる）
function stageTranslate(stage: Stage, halfPx: number): number {
  return fullPx() - stageHeightPx(stage, halfPx);
}
export default function MobileSheet({ municipality, onClose }: Props) {
  const [stage, setStage] = useState<Stage>("half");
  // ドラッグ中の translateY（null = 非ドラッグ）
  const [dragY, setDragY] = useState<number | null>(null);
  const dragStartY = useRef<number | null>(null);
  const dragStartTranslate = useRef(0);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const halfContentRef = useRef<HTMLDivElement | null>(null);
  // half 段の高さ（実測）。「自治体名＋指標カード」がちょうど収まる高さに合わせる。
  const [halfPx, setHalfPx] = useState(HALF_PX_FALLBACK);

  // 新規選択で half に戻す
  useEffect(() => {
    setStage("half");
    setDragY(null);
  }, [municipality?.code]);

  // half 段の高さを実コンテンツに合わせて計測する。指標カードの下端
  // （ハンドル＋見出しを含むシート先頭からの距離）＋ sheet-content の下パディングを
  // half 高とし、カード下に無駄な余白が出ないようにする（自治体や折返しで可変）。
  useEffect(() => {
    if (!municipality || stage === "peek") return;
    const el = halfContentRef.current;
    if (!el) return;
    const measure = () => setHalfPx(Math.round(el.offsetTop + el.offsetHeight + 20));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [municipality?.code, stage]);

  // 凡例・地図コントロール・レイヤーパネルが現在の可視シート高に追従できるよう、
  // 祖先 .map-root に CSS変数 --sheet-h を書き込む（CSS は calc(var(--sheet-h)+…) で読む）。
  // シートは height 固定（vh基準）＋ transform で段を切替えるが、iOS では CSS の vh と
  // window.innerHeight が URLバーぶんズレるため、calc 文字列ではなく実測 px を流す:
  // 可視高 = シートの実 offsetHeight − 適用中の translateY（どちらも単位非依存で厳密）。
  useEffect(() => {
    const root = document.querySelector(".map-root") as HTMLElement | null;
    if (!root) return;
    if (!municipality) {
      root.style.removeProperty("--sheet-h");
      return;
    }
    const apply = () => {
      const full = sheetRef.current?.offsetHeight ?? fullPx();
      const visible = Math.max(0, full - stageTranslate(stage, halfPx));
      root.style.setProperty("--sheet-h", `${Math.round(visible)}px`);
    };
    apply();
    // 回転・URLバー開閉で実寸が変わるため再計測
    window.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("resize", apply);
      root.style.removeProperty("--sheet-h");
    };
  }, [stage, municipality, halfPx]);

  if (!municipality) return null;
  const m = municipality;

  // タップ: peek→half→full→half（peek へはドラッグで畳む）
  const toggle = () =>
    setStage((s) => (s === "full" ? "half" : s === "half" ? "full" : "half"));
  const collapse = () => setStage("half");

  const maxTranslate = () => fullPx() - PEEK_PX; // peek が最も下

  const onTouchStart = (e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    dragStartTranslate.current = stageTranslate(stage, halfPx);
    setDragY(stageTranslate(stage, halfPx));
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    // peek 未満 / full 超にクランプ
    const t = Math.max(0, Math.min(maxTranslate(), dragStartTranslate.current + dy));
    setDragY(t);
  };
  const onTouchEnd = () => {
    if (dragStartY.current === null) return;
    const live = dragY ?? stageTranslate(stage, halfPx);
    // 最近傍の段へスナップ
    let target = STAGE_ORDER.reduce<Stage>(
      (best, s) =>
        Math.abs(stageTranslate(s, halfPx) - live) < Math.abs(stageTranslate(best, halfPx) - live)
          ? s
          : best,
      STAGE_ORDER[0],
    );
    // フリック補正: 同段に戻る小スワイプでも明確な方向には1段送る
    const moved = live - stageTranslate(stage, halfPx); // +下方向 / -上方向
    const FLICK = 56;
    if (target === stage) {
      const idx = STAGE_ORDER.indexOf(stage);
      if (moved > FLICK && idx > 0) target = STAGE_ORDER[idx - 1];
      else if (moved < -FLICK && idx < STAGE_ORDER.length - 1) target = STAGE_ORDER[idx + 1];
    }
    setStage(target);
    setDragY(null);
    dragStartY.current = null;
  };

  const heading = m.displayName ?? m.name;

  const translate = dragY !== null ? dragY : stageTranslate(stage, halfPx);
  const dragging = dragY !== null;

  // scrim は full 付近のみ。full(translate=0)→half へ離れるほど薄くなる。
  const halfT = stageTranslate("half", halfPx);
  const scrimIntensity = halfT > 0 ? Math.max(0, Math.min(1, 1 - translate / halfT)) : 0;

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
        ref={sheetRef}
        className={`sheet sheet-stage-${stage}${dragging ? " is-dragging" : ""}`}
        style={{ height: SHEET_HEIGHT, transform: `translateY(${translate}px)` }}
        role={stage === "full" ? "dialog" : "region"}
        aria-modal={stage === "full" || undefined}
        aria-label={`${heading}の詳細`}
      >
        {/* ハンドル + スワイプ受付エリア。タップでも段送り */}
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
                {hasRent(m.rent.value) ? (
                  <>家賃 <strong style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{m.rent.value.toLocaleString()}</strong> 円/月</>
                ) : (
                  <>家賃 <strong style={{ color: "var(--text-muted)" }}>データなし</strong></>
                )}
                <span className="trend-chip">{m.populationTrend}</span>
              </p>
            </div>
            <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
              <button
                className="panel-close"
                aria-label={stage === "full" ? "シートを縮める" : "シートを拡大"}
                onClick={toggle}
              >
                {stage === "full" ? <ChevronDown /> : <ChevronUp />}
              </button>
              <button className="panel-close" aria-label="閉じる" onClick={onClose}>×</button>
            </div>
          </div>

          {/* peek では指標カードは隠す（地図優先・名称＋家賃のみ）。
              half 高の実測はこの要素の下端を基準にする（ref）。 */}
          {stage !== "peek" && (
            <div ref={halfContentRef} style={{ marginTop: 10 }}>
              <MetricCards m={m} />
            </div>
          )}

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
