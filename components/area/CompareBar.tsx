// 当該自治体／都道府県平均／全国平均を並べて比べる比較バー（単一の ProgressBar ではなく
// 複数行の水平バー）。各行の幅は3値の最大を100%に正規化する。self 行を強調表示。
export type CompareRow = { label: string; value: number; self?: boolean };

export function CompareBar({
  rows,
  format,
  caption,
}: {
  rows: CompareRow[];
  format: (v: number) => string;
  caption: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="ad-compare" role="group" aria-label={caption}>
      {rows.map((r) => (
        <div key={r.label} className={`ad-compare-row ${r.self ? "is-self" : ""}`}>
          <span className="ad-compare-label">{r.label}</span>
          <span className="ad-compare-track" aria-hidden="true">
            <span
              className="ad-compare-fill"
              style={{ width: `${Math.max(4, (r.value / max) * 100)}%` }}
            />
          </span>
          <span className="ad-compare-value">{format(r.value)}</span>
        </div>
      ))}
    </div>
  );
}
