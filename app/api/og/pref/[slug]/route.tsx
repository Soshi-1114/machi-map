import { ImageResponse } from "next/og";
import { listMunicipalities } from "@/lib/metrics";
import { getPrefBySlug } from "@/lib/prefs";
import { OgFrame, OgHeading, Pill, OG_SIZE } from "@/lib/og";
import { PREF_SLUG_RE, rejectQueryBusting, OG_IMAGE_HEADERS } from "@/lib/apiGuard";

export const runtime = "edge";

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const rejected = rejectQueryBusting(req);
  if (rejected) return rejected;
  if (!PREF_SLUG_RE.test(params.slug)) return new Response("invalid slug", { status: 400 });
  const pref = getPrefBySlug(params.slug);
  if (!pref) return new Response("not found", { status: 404 });
  const count = (await listMunicipalities(params.slug)).length;

  return new ImageResponse(
    (
      <OgFrame>
        <OgHeading
          eyebrow="都道府県の住みやすさ"
          title={pref.nameJa}
          sub="市区町村を家賃・地価・子育てで比較"
          titleSize={96}
        />
        <div style={{ marginTop: "auto", display: "flex", gap: 16 }}>
          <Pill>全{count}市区町村</Pill>
          <Pill>家賃ランキング</Pill>
          <Pill>政府統計の実データ</Pill>
        </div>
      </OgFrame>
    ),
    { ...OG_SIZE, headers: OG_IMAGE_HEADERS },
  );
}
