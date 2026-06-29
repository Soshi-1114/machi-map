// セクション共通レイアウト（アイコンチップ＋見出し＋任意のリンク）。
// スクロールインの fade-up を Reveal で付与する。
import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { Reveal } from "./Reveal";

export function Section({
  icon: Icon,
  tone,
  title,
  sub,
  link,
  children,
}: {
  icon?: LucideIcon;
  /** アイコンチップの配色クラス（ad-tone-rent など） */
  tone?: string;
  title: string;
  sub?: string;
  link?: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <Reveal as="section" className="ad-section">
      <div className="ad-section-head">
        {Icon && (
          <span className={`ad-section-icon ${tone ?? ""}`} aria-hidden="true">
            <Icon size={20} />
          </span>
        )}
        <div className="ad-section-heading">
          <h2 className="ad-h2">{title}</h2>
          {sub && <p className="ad-section-sub">{sub}</p>}
        </div>
        {link && (
          <Link href={link.href} className="ad-section-link">
            {link.label}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        )}
      </div>
      {children}
    </Reveal>
  );
}
