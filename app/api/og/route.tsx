import { ImageResponse } from "next/og";
import { OgFrame, OgHeading, Pill, OG_SIZE } from "@/lib/og";
import { rejectQueryBusting, OG_IMAGE_HEADERS } from "@/lib/apiGuard";

export const runtime = "edge";

// トップ／既定の OG 画像。データ取得なしの固定意匠。
export function GET(req: Request) {
  const rejected = rejectQueryBusting(req);
  if (rejected) return rejected;
  return new ImageResponse(
    (
      <OgFrame>
        <OgHeading
          title="住みやすさを地図で比較"
          sub="家賃・地価・人口・子育て・災害リスク"
          titleSize={84}
        />
        <div style={{ marginTop: "auto", display: "flex", gap: 16 }}>
          <Pill>全国1,918市区町村</Pill>
          <Pill>政府統計の実データ</Pill>
          <Pill>無料</Pill>
        </div>
      </OgFrame>
    ),
    { ...OG_SIZE, headers: OG_IMAGE_HEADERS },
  );
}
