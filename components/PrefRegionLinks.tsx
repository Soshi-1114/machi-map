// 都道府県リンクを地方区分（北海道・東北・関東…）ごとにまとめて並べるサーバー
// コンポーネント。メニュー・ピラー・ランキングの「都道府県別に見る」で共有し、
// 全国の県が分類なしに並ぶ探しづらさを解消する。リンク先・装飾クラスは呼び出し側で指定。

import Link from "next/link";
import { prefsByRegion, type PrefEntry } from "@/lib/prefs";

export default function PrefRegionLinks({
  href,
  linkClassName,
  gridClassName,
  prefs,
}: {
  /** スラッグからリンク先 URL を組み立てる */
  href: (slug: string) => string;
  /** 各都道府県リンクの class（例 "home-pref-link" / "pref-chip"） */
  linkClassName: string;
  /** リスト（グリッド/チップ行）の class（例 "home-pref-grid" / "pref-chip-grid"） */
  gridClassName: string;
  /** 対象 pref（既定は全47都道府県。県別ページでは「データのある県だけ」を渡す） */
  prefs?: PrefEntry[];
}) {
  const groups = prefsByRegion(prefs);
  return (
    <div className="pref-regions">
      {groups.map((g) => (
        <div key={g.key} className="pref-region-group">
          <p className="pref-region-label">{g.nameJa}</p>
          <ul className={gridClassName}>
            {g.prefs.map((p) => (
              <li key={p.slug}>
                <Link href={href(p.slug)} className={linkClassName}>
                  {p.nameJa}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
