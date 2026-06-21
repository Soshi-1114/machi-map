import Link from "next/link";
import type { Metadata } from "next";
import { listSummaryAcrossPrefs } from "@/lib/metrics";
import { SITE, prefNameOf, absoluteUrl } from "@/lib/site";
import { hasRent } from "@/lib/rentColor";
import type { MuniSummary } from "@/lib/types";

type SearchParams = { q?: string };

const MAX_RESULTS = 60;

// 内部検索結果は薄い／重複ページになりやすいため noindex（クロール対象外）。
// ただし WebSite の SearchAction のターゲットとして機能する実URLは必要。
export function generateMetadata({ searchParams }: { searchParams: SearchParams }): Metadata {
  const q = (searchParams.q ?? "").trim();
  const title = q ? `「${q}」の検索結果｜${SITE.name}` : `自治体を検索｜${SITE.name}`;
  return {
    title,
    description: `${SITE.name}で市区町村を検索。家賃・地価・子育て・災害リスクを自治体ごとに比較できます。`,
    alternates: { canonical: absoluteUrl("/search") },
    robots: { index: false, follow: true },
  };
}

/** クライアント地図検索（MapView）と同じ一致規則。displayName/name の部分一致。 */
function matchMuni(all: MuniSummary[], q: string): MuniSummary[] {
  const needle = q.trim();
  if (!needle) return [];
  return all
    .filter((m) => (m.displayName ?? m.name).includes(needle) || m.name.includes(needle))
    .sort((a, b) => {
      // 前方一致を優先し、次に名前の短い順（より具体的な一致を上位に）
      const an = a.displayName ?? a.name;
      const bn = b.displayName ?? b.name;
      const ap = an.startsWith(needle) ? 0 : 1;
      const bp = bn.startsWith(needle) ? 0 : 1;
      return ap - bp || an.length - bn.length;
    })
    .slice(0, MAX_RESULTS);
}

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const q = (searchParams.q ?? "").trim();
  const all = await listSummaryAcrossPrefs();
  const results = matchMuni(all, q);

  return (
    <div className="detail-root">
      <nav aria-label="パンくず" className="breadcrumb">
        <Link href="/" className="breadcrumb-link">{SITE.name}</Link>
        <span aria-hidden="true">/</span>
        <span className="breadcrumb-current">検索</span>
      </nav>

      <header className="detail-hero">
        <h1 className="detail-title">
          自治体を検索
          {q && <span className="detail-title-sub">「{q}」の結果</span>}
        </h1>
        <form action="/search" method="get" className="search-form">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="市区町村名で検索（例: 川口市）"
            aria-label="市区町村名で検索"
            className="search-form-input"
          />
          <button type="submit" className="search-form-btn">検索</button>
        </form>
      </header>

      <section className="detail-section">
        {q ? (
          results.length > 0 ? (
            <>
              <p className="detail-p" style={{ color: "var(--text-muted)", fontSize: 13.5 }}>
                「{q}」に一致する自治体 {results.length}件{results.length === MAX_RESULTS ? "（上位のみ）" : ""}
              </p>
              <ul className="related-grid">
                {results.map((m) => (
                  <li key={m.code}>
                    <Link href={`/area/${m.pref}/${m.code}`} className="related-card">
                      <span className="related-name">
                        {m.displayName ?? m.name}
                        <span className="related-sub">{prefNameOf(m.pref)}</span>
                      </span>
                      <span className="related-rent">
                        {hasRent(m.rent) ? `${m.rent.toLocaleString()} 円/月` : "家賃データなし"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="detail-p">「{q}」に一致する自治体は見つかりませんでした。市区町村名（例: 川口市、浦和区）でお試しください。</p>
          )
        ) : (
          <p className="detail-p" style={{ color: "var(--text-muted)" }}>
            市区町村名を入力して検索してください。地図から探す場合は{" "}
            <Link href="/" className="breadcrumb-link">トップの地図</Link> もご利用いただけます。
          </p>
        )}
      </section>

      <div style={{ marginTop: 28, display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Link href="/ranking" className="detail-back">ランキング</Link>
        <Link href="/" className="detail-back">地図に戻る</Link>
      </div>
    </div>
  );
}
