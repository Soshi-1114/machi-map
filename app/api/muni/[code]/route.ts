// 自治体コードからフル Municipality を返す。トップ地図で自治体を選択した時に
// 詳細パネル用にオンデマンド取得する（初期ページは軽量サマリのみ配信）。
import { NextResponse } from "next/server";
import { getMunicipality } from "@/lib/metrics";

export async function GET(
  _req: Request,
  { params }: { params: { code: string } },
) {
  const m = await getMunicipality(params.code);
  if (!m) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(m, {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
  });
}
