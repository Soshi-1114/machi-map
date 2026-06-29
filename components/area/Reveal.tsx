// スクロール/マウント時の控えめな fade-up。
//
// 実装メモ: framer-motion の whileInView / animate は環境によって発火せず内容が
// opacity:0 のまま残る事故が確認されたため、確実性を優先して CSS アニメーションに
// 統一した。CSS アニメは JS / IntersectionObserver に依存せず必ず最終フレーム
// （可視）で終わる。prefers-reduced-motion 時はアニメ無効＝既定で可視のまま。
// （server component。"use client" 不要）
import type { ReactNode } from "react";

export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li";
}) {
  return (
    <Tag
      className={`ad-reveal ${className ?? ""}`}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
