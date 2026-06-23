// JSON-LD（構造化データ）を <script type="application/ld+json"> に安全に埋め込む
// ためのシリアライザ。
//
// JSON.stringify は '<' をエスケープしないため、データ中に "</script>" や "<!--" が
// 含まれると <script> ブロックを抜け出して任意マークアップ＝XSS が成立しうる。
// 現状データは政府統計（信頼済み・コミット済み）でユーザー入力ではないが、将来の
// データソース拡張に対する多層防御として '<' を < に無害化する
// （Next.js 自身が内部データ埋め込みで行っているのと同じ手法）。
export function jsonLdHtml(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
