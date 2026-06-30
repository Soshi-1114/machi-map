// 5段階の星評価表示（フル／ハーフの2種類）。スコアを 0.5 刻みに丸め、各星を
// 「空・半分・全部」のいずれかで描く。半分は lucide 専用の StarHalf を使い、
// グレーのフル星を土台に金の塗りつぶしを重ねる（中央でクリップせず自然な形に）。
// 装飾だが SR 向けに aria-label を持つ。
import { Star, StarHalf } from "lucide-react";

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
  // 0.5 刻みへ丸める → 各星は full / half / empty のいずれかになる。
  const rounded = Math.round(clamped * 2) / 2;
  return (
    <span
      className={`ad-stars ${className ?? ""}`}
      role="img"
      aria-label={`5段階中 ${rounded.toFixed(1)}`}
    >
      {[0, 1, 2, 3, 4].map((i) => {
        const diff = rounded - i;
        const state = diff >= 1 ? "full" : diff === 0.5 ? "half" : "empty";
        return (
          <span key={i} className="ad-star" style={{ width: size, height: size }} aria-hidden="true">
            {/* 土台＝グレーのフル星（空・半分の右側の輪郭になる） */}
            <Star size={size} className="ad-star-bg" strokeWidth={1.5} />
            {state === "full" && (
              <span className="ad-star-fg">
                <Star size={size} className="ad-star-fill" strokeWidth={1.5} />
              </span>
            )}
            {state === "half" && (
              <span className="ad-star-fg">
                <StarHalf size={size} className="ad-star-fill" strokeWidth={1.5} />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}
