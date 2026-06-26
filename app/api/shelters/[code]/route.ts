// 自治体コードから、その自治体内の指定緊急避難場所を GeoJSON FeatureCollection で返す。
// 地図で「災害オーバーレイON かつ 市区町村選択中」のときにオンデマンド取得して点を
// プロットする（初期配信のサマリには載せない＝全国十数万点を抱えないため）。
import { NextResponse } from "next/server";
import { getShelters, entryToFeatureCollection } from "@/lib/shelters";

export async function GET(
  _req: Request,
  { params }: { params: { code: string } },
) {
  const entry = await getShelters(params.code);
  if (!entry) return NextResponse.json({ error: "not found" }, { status: 404 });
  const fc = entryToFeatureCollection(entry);
  return NextResponse.json(
    { source: entry.source, asOf: entry.asOf, ...fc },
    { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } },
  );
}
