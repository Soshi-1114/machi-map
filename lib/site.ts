// サイト基本設定。本番ドメイン取得時にここを変えるだけで全ページの絶対URLが追従する。
export const SITE = {
  name: "MachiMap",
  description: "市区町村の住みやすさを地図で横断比較",
  baseUrl: "https://machi-map.vercel.app",
  locale: "ja_JP",
  brandColor: "#2563eb",
} as const;

export const PREF_NAMES_JA: Record<string, string> = {
  saitama: "埼玉県",
};

export function absoluteUrl(path: string): string {
  return `${SITE.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}
