import type { MetadataRoute } from "next";
import type { Municipality } from "@/lib/types";
import { listAllAcrossPrefs } from "@/lib/metrics";
import { PREFS } from "@/lib/prefs";
import { RANKINGS, muniLevelOnly } from "@/lib/rankings";
import { latestLastModified, muniLastModified } from "@/lib/dataFreshness";
import { absoluteUrl } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const all = await listAllAcrossPrefs();
  // lastModified はデータの実 vintage（asOf）から導く。毎ビルド now を入れると
  // 「常に全更新」のノイズ信号になるため、データ更新時だけ日付が動くようにする。
  const fallback = new Date();
  const siteLatest = latestLastModified(all) ?? fallback;

  // 県ごとに自治体をまとめ、県単位の最新 asOf を1度だけ算出（ハブ + 各自治体で共有）。
  const byPref = new Map<string, Municipality[]>();
  for (const m of all) {
    const g = byPref.get(m.pref);
    if (g) g.push(m);
    else byPref.set(m.pref, [m]);
  }
  const prefLatest = new Map<string, Date>();
  for (const [slug, munis] of byPref) {
    prefLatest.set(slug, latestLastModified(munis) ?? siteLatest);
  }

  const entries: MetadataRoute.Sitemap = [
    {
      // トップの canonical は末尾スラッシュ付き（absoluteUrl("/") = https://kurashimap.jp/）。
      // sitemap の loc も揃えて重複（slash有無）判定のノイズを避ける。
      url: absoluteUrl("/"),
      lastModified: siteLatest,
      changeFrequency: "weekly",
      priority: 1,
    },
    // ランキング一覧 + 各ランキング（比較系クエリの入口）。中身は全データ由来なのでサイト最新。
    {
      url: absoluteUrl("/ranking"),
      lastModified: siteLatest,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...RANKINGS.map((r) => ({
      url: absoluteUrl(`/ranking/${r.slug}`),
      lastModified: siteLatest,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    // 県別ランキング（県 × 指標。該当データのある組み合わせのみ）
    ...PREFS.flatMap((p) => {
      const munis = muniLevelOnly(byPref.get(p.slug) ?? []);
      return RANKINGS.filter((r) => munis.some((m) => r.qualifies(m))).map((r) => ({
        url: absoluteUrl(`/ranking/${r.slug}/${p.slug}`),
        lastModified: prefLatest.get(p.slug) ?? siteLatest,
        changeFrequency: "monthly" as const,
        priority: 0.6,
      }));
    }),
    // 県別ハブページ（全自治体への内部リンク集約・検索の入口）
    ...PREFS.map((p) => ({
      url: absoluteUrl(`/area/${p.slug}`),
      lastModified: prefLatest.get(p.slug) ?? siteLatest,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    ...all.map((m) => ({
      url: absoluteUrl(`/area/${m.pref}/${m.code}`),
      lastModified: muniLastModified(m) ?? prefLatest.get(m.pref) ?? siteLatest,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
  return entries;
}
