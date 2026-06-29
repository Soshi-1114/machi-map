// 5段階の星評価表示（小数対応）。lucide の Star を背景＋前景クリップで重ね、
// value の端数を幅%で表現する。装飾だがスクリーンリーダー向けに aria-label を持つ。
import { Star } from "lucide-react";

export function Stars({
  value,
  size = 18,
  className,
}: {
  value: number;
  size?: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(5, value));
  return (
    <span
      className={`ad-stars ${className ?? ""}`}
      role="img"
      aria-label={`5段階中 ${clamped.toFixed(1)}`}
    >
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, clamped - i));
        return (
          <span key={i} className="ad-star" style={{ width: size, height: size }} aria-hidden="true">
            <Star size={size} className="ad-star-bg" strokeWidth={1.5} />
            <span className="ad-star-fg" style={{ width: `${fill * 100}%` }}>
              <Star size={size} className="ad-star-fill" strokeWidth={1.5} />
            </span>
          </span>
        );
      })}
    </span>
  );
}
