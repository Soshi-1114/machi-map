import type { MetadataRoute } from "next";
import { listAllAcrossPrefs } from "@/lib/metrics";
import { PREFS } from "@/lib/prefs";
import { SITE, absoluteUrl } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const all = await listAllAcrossPrefs();
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [
    {
      url: SITE.baseUrl,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    // 県別ハブページ（全自治体への内部リンク集約・検索の入口）
    ...PREFS.map((p) => ({
      url: absoluteUrl(`/area/${p.slug}`),
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    ...all.map((m) => ({
      url: absoluteUrl(`/area/${m.pref}/${m.code}`),
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
  return entries;
}
