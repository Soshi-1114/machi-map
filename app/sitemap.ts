import type { MetadataRoute } from "next";
import { listAll } from "@/lib/metrics";
import { SITE, absoluteUrl } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const all = await listAll("saitama");
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [
    {
      url: SITE.baseUrl,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...all.map((m) => ({
      url: absoluteUrl(`/area/${m.pref}/${m.code}`),
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
  return entries;
}
