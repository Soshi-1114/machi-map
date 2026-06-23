// 国土地理院タイルの同一originプロキシ。
// GSI は CORS ヘッダを返さないため、MapLibre が WebGL テクスチャ化できない。
// 自ドメイン経由で配信すれば same-origin 扱いで描画できる。
import { NextResponse } from "next/server";
import { rejectQueryBusting } from "@/lib/apiGuard";

export const runtime = "edge";

const STYLE = "pale"; // 国土地理院 淡色地図
const MAX_ZOOM = 18; // GSI 淡色地図の最大ズーム。範囲外は上流 fetch する前に弾く。

export async function GET(
  req: Request,
  { params }: { params: { z: string; x: string; y: string } },
) {
  // クエリバスティング（?_=N で CDN キャッシュをすり抜け上流 fetch を増幅）を弾く。
  const rejected = rejectQueryBusting(req);
  if (rejected) return rejected;
  const { z, x, y } = params;
  if (!/^\d{1,2}$/.test(z) || !/^\d{1,7}$/.test(x) || !/^\d{1,7}$/.test(y)) {
    return new NextResponse("invalid params", { status: 400 });
  }
  // ズーム値・タイル座標を有効範囲に制限（範囲外は上流に投げずに 400）。
  const zi = Number(z);
  if (zi > MAX_ZOOM) {
    return new NextResponse("invalid zoom", { status: 400 });
  }
  const max = 2 ** zi;
  if (Number(x) >= max || Number(y) >= max) {
    return new NextResponse("tile out of range", { status: 400 });
  }
  const upstream = `https://cyberjapandata.gsi.go.jp/xyz/${STYLE}/${z}/${x}/${y}.png`;
  const r = await fetch(upstream, { cache: "force-cache" });
  if (!r.ok) {
    return new NextResponse(null, { status: r.status });
  }
  return new NextResponse(r.body, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
    },
  });
}
