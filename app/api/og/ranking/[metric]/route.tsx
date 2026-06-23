import { ImageResponse } from "next/og";
import { getRankingBySlug } from "@/lib/rankings";
import { OgFrame, OgHeading, Pill, OG_SIZE } from "@/lib/og";
import { METRIC_SLUG_RE, rejectQueryBusting, OG_IMAGE_HEADERS } from "@/lib/apiGuard";

export const runtime = "edge";

// ランキングOG。全国集計はデータ全量ロードになり edge では重いため、画像は
// タイトル中心の意匠とし、1位などの動的値は載せない。
export function GET(req: Request, { params }: { params: { metric: string } }) {
  const rejected = rejectQueryBusting(req);
  if (rejected) return rejected;
  if (!METRIC_SLUG_RE.test(params.metric)) return new Response("invalid metric", { status: 400 });
  const def = getRankingBySlug(params.metric);
  if (!def) return new Response("not found", { status: 404 });

  return new ImageResponse(
    (
      <OgFrame>
        <OgHeading
          eyebrow="全国ランキング"
          title={def.title}
          sub="政府統計の実データで市区町村を比較"
          titleSize={64}
        />
        <div style={{ marginTop: "auto", display: "flex", gap: 16 }}>
          <Pill>{def.columnLabel}で比較</Pill>
          <Pill>全国の市区町村</Pill>
        </div>
      </OgFrame>
    ),
    { ...OG_SIZE, headers: OG_IMAGE_HEADERS },
  );
}
