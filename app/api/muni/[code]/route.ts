// 自治体コードからフル Municipality を返す。トップ地図で自治体を選択した時に
// 詳細パネル用にオンデマンド取得する（初期ページは軽量サマリのみ配信）。
import { NextResponse } from "next/server";
import { getMunicipality } from "@/lib/metrics";
import { MUNI_CODE_RE, rejectQueryBusting, DATA_JSON_HEADERS } from "@/lib/apiGuard";

export async function GET(
  req: Request,
  { params }: { params: { code: string } },
) {
  // クエリバスティング棄却 + フォーマット検証を、データロードの前に安価に行う。
  const rejected = rejectQueryBusting(req);
  if (rejected) return rejected;
  if (!MUNI_CODE_RE.test(params.code)) {
    return NextResponse.json({ error: "invalid code" }, { status: 400 });
  }
  const m = await getMunicipality(params.code);
  if (!m) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(m, { headers: DATA_JSON_HEADERS });
}
