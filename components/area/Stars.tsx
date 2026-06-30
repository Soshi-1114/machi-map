// 5段階の星評価表示（フル／ハーフの2種類）。lucide の Star を背景＋前景クリップで
// 重ね、スコアを 0.5 刻みに丸めて各星を「空・半分・全部」のいずれかで描く。
// ハーフは星の左半分だけ塗りつぶす。装飾だが SR 向けに aria-label を持つ。
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
  // 0.5 刻みへ丸める → 各星のフィルは 0 / 0.5 / 1 のいずれかになる。
  const rounded = Math.round(clamped * 2) / 2;
  return (
    <span
      className={`ad-stars ${className ?? ""}`}
      role="img"
      aria-label={`5段階中 ${rounded.toFixed(1)}`}
    >
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, rounded - i));
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
