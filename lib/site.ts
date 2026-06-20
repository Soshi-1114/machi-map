// サイト基本設定。本番ドメイン取得時にここを変えるだけで全ページの絶対URLが追従する。
import { PREFS } from "./prefs";

export const SITE = {
  name: "KurashiMap",
  description: "市区町村の住みやすさを地図で横断比較",
  baseUrl: "https://kurashimap.jp",
  locale: "ja_JP",
  brandColor: "#2563eb",
} as const;

// pref スラッグ → 和名。対応県マニフェスト（PREFS）から導出するので、
// 県を追加したら lib/prefs.ts に 1 行足すだけでここも追従する。
export const PREF_NAMES_JA: Record<string, string> = Object.fromEntries(
  PREFS.map((p) => [p.slug, p.nameJa]),
);

/** pref スラッグ → 和名。未知スラッグはそのまま返す。 */
export function prefNameOf(slug: string): string {
  return PREF_NAMES_JA[slug] ?? slug;
}

export function absoluteUrl(path: string): string {
  return `${SITE.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}
