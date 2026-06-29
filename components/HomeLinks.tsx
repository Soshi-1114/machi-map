// トップに置くクロール可能な内部リンク帯（サーバーコンポーネント＝初期HTMLに出力）。
// PC ではマップ下のコンテンツ、SP ではドロワー内に同じDOMを表示する（HomeShell が制御）。

import Link from "next/link";
import { PREFS } from "@/lib/prefs";
import { RANKINGS } from "@/lib/rankings";

export type PopularMuni = { pref: string; code: string; name: string };

export default function HomeLinks({ popular }: { popular: PopularMuni[] }) {
  return (
    <div className="home-links-inner">
      <p className="home-links-lead-title">市区町村の住みやすさを、地図とデータで比較</p>
      <p className="home-links-lead">
        全国1,918市区町村の家賃・地価・人口・待機児童・災害リスク・外国人住民比率を、政府統計の実データで横断比較できます（推計値は使いません）。
      </p>

      <section className="home-links-block">
        <h2 className="home-links-h">都道府県から探す</h2>
        <ul className="home-pref-grid">
          {PREFS.map((p) => (
            <li key={p.slug}>
              <Link href={`/area/${p.slug}`} className="home-pref-link">{p.nameJa}</Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="home-links-block">
        <h2 className="home-links-h">地図で見る</h2>
        <ul className="home-chip-row">
          <li><Link href="/map/foreign-ratio" className="home-chip">外国人住民の割合マップ</Link></li>
        </ul>
      </section>

      <section className="home-links-block">
        <h2 className="home-links-h">ランキングで比較</h2>
        <ul className="home-chip-row">
          {RANKINGS.map((r) => (
            <li key={r.slug}>
              <Link href={`/ranking/${r.slug}`} className="home-chip">{r.title}</Link>
            </li>
          ))}
        </ul>
      </section>

      {popular.length > 0 && (
        <section className="home-links-block">
          <h2 className="home-links-h">人気の自治体</h2>
          <ul className="home-chip-row">
            {popular.map((m) => (
              <li key={m.code}>
                <Link href={`/area/${m.pref}/${m.code}`} className="home-chip">{m.name}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="home-links-foot">
        © KurashiMap — 出典: e-Stat（住宅・土地統計調査／国勢調査）・地価公示／地価調査・不動産情報ライブラリ・こども家庭庁・出入国在留管理庁 在留外国人統計（e-Stat）
      </p>
    </div>
  );
}
