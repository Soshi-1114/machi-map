// 対応都道府県マニフェスト（純粋なメタデータ）。
// 新規県を追加する時はここに entry を 1 行足し、data/{slug}.json と
// （政令市があれば）data/{slug}_wards.json + public/{slug}.geojson + 必要なら
// public/{slug}_wards.geojson を準備する。

import type { Municipality } from "./types";

export type PrefEntry = {
  slug: string;
  nameJa: string;
  /** 全国地方公共団体コードの先頭 2 桁 */
  codePrefix: string;
  /** 政令市の行政区 wards.json を持っているか */
  hasWards: boolean;
};

// 各 pref データのローダ。テンプレートリテラルの動的 import なので Next.js の
// コード分割が効き、必要時のみ該当 pref の chunk が読み込まれる（全47県を
// ホームページに乗せない）。
export async function loadPrefData(
  slug: string,
  hasWards: boolean,
): Promise<{ muni: Municipality[]; wards: Municipality[] }> {
  const muni = (await import(`../data/${slug}.json`)).default as Municipality[];
  const wards = hasWards
    ? ((await import(`../data/${slug}_wards.json`)).default as Municipality[])
    : [];
  return { muni, wards };
}

export const PREFS: PrefEntry[] = [
  { slug: "saitama", nameJa: "埼玉県", codePrefix: "11", hasWards: true },
  { slug: "chiba", nameJa: "千葉県", codePrefix: "12", hasWards: true },
  { slug: "gunma", nameJa: "群馬県", codePrefix: "10", hasWards: false },
  { slug: "tochigi", nameJa: "栃木県", codePrefix: "09", hasWards: false },
  { slug: "ibaraki", nameJa: "茨城県", codePrefix: "08", hasWards: false },
  { slug: "tokyo", nameJa: "東京都", codePrefix: "13", hasWards: false },
  { slug: "kanagawa", nameJa: "神奈川県", codePrefix: "14", hasWards: true },
  { slug: "yamanashi", nameJa: "山梨県", codePrefix: "19", hasWards: false },
  { slug: "nagano", nameJa: "長野県", codePrefix: "20", hasWards: false },
  { slug: "gifu", nameJa: "岐阜県", codePrefix: "21", hasWards: false },
  { slug: "shizuoka", nameJa: "静岡県", codePrefix: "22", hasWards: true },
  { slug: "aichi", nameJa: "愛知県", codePrefix: "23", hasWards: true },
  { slug: "mie", nameJa: "三重県", codePrefix: "24", hasWards: false },
  { slug: "shiga", nameJa: "滋賀県", codePrefix: "25", hasWards: false },
  { slug: "kyoto", nameJa: "京都府", codePrefix: "26", hasWards: true },
  { slug: "osaka", nameJa: "大阪府", codePrefix: "27", hasWards: true },
  { slug: "hyogo", nameJa: "兵庫県", codePrefix: "28", hasWards: true },
  { slug: "nara", nameJa: "奈良県", codePrefix: "29", hasWards: false },
  { slug: "wakayama", nameJa: "和歌山県", codePrefix: "30", hasWards: false },
  { slug: "tottori", nameJa: "鳥取県", codePrefix: "31", hasWards: false },
  { slug: "shimane", nameJa: "島根県", codePrefix: "32", hasWards: false },
  { slug: "okayama", nameJa: "岡山県", codePrefix: "33", hasWards: true },
  { slug: "hiroshima", nameJa: "広島県", codePrefix: "34", hasWards: true },
  { slug: "yamaguchi", nameJa: "山口県", codePrefix: "35", hasWards: false },
  { slug: "tokushima", nameJa: "徳島県", codePrefix: "36", hasWards: false },
  { slug: "kagawa", nameJa: "香川県", codePrefix: "37", hasWards: false },
  { slug: "ehime", nameJa: "愛媛県", codePrefix: "38", hasWards: false },
  { slug: "kochi", nameJa: "高知県", codePrefix: "39", hasWards: false },
  { slug: "fukuoka", nameJa: "福岡県", codePrefix: "40", hasWards: true },
  { slug: "saga", nameJa: "佐賀県", codePrefix: "41", hasWards: false },
  { slug: "nagasaki", nameJa: "長崎県", codePrefix: "42", hasWards: false },
  { slug: "kumamoto", nameJa: "熊本県", codePrefix: "43", hasWards: true },
  { slug: "oita", nameJa: "大分県", codePrefix: "44", hasWards: false },
  { slug: "miyazaki", nameJa: "宮崎県", codePrefix: "45", hasWards: false },
  { slug: "kagoshima", nameJa: "鹿児島県", codePrefix: "46", hasWards: false },
  { slug: "okinawa", nameJa: "沖縄県", codePrefix: "47", hasWards: false },
  { slug: "aomori", nameJa: "青森県", codePrefix: "02", hasWards: false },
  { slug: "iwate", nameJa: "岩手県", codePrefix: "03", hasWards: false },
  { slug: "miyagi", nameJa: "宮城県", codePrefix: "04", hasWards: true },
  { slug: "akita", nameJa: "秋田県", codePrefix: "05", hasWards: false },
  { slug: "yamagata", nameJa: "山形県", codePrefix: "06", hasWards: false },
  { slug: "fukushima", nameJa: "福島県", codePrefix: "07", hasWards: false },
  { slug: "niigata", nameJa: "新潟県", codePrefix: "15", hasWards: true },
  { slug: "toyama", nameJa: "富山県", codePrefix: "16", hasWards: false },
  { slug: "ishikawa", nameJa: "石川県", codePrefix: "17", hasWards: false },
  { slug: "fukui", nameJa: "福井県", codePrefix: "18", hasWards: false },
  { slug: "hokkaido", nameJa: "北海道", codePrefix: "01", hasWards: true },
];

// 地方区分（全国地方公共団体コード先頭2桁で機械的に分類）。PREFS の並びは
// データ整備順なので、UI で「全国の都道府県が分類なしに並ぶ」のを避けるため
// ここで地方ごとにまとめ直す。中部は北陸・甲信越を含め、東海を独立させる
// （一般的な9地方区分。利用者が地理的に探しやすい粒度）。
export type RegionGroup = { key: string; nameJa: string; prefixes: string[] };

export const REGIONS: RegionGroup[] = [
  { key: "hokkaido", nameJa: "北海道", prefixes: ["01"] },
  { key: "tohoku", nameJa: "東北", prefixes: ["02", "03", "04", "05", "06", "07"] },
  { key: "kanto", nameJa: "関東", prefixes: ["08", "09", "10", "11", "12", "13", "14"] },
  { key: "chubu", nameJa: "中部・北陸", prefixes: ["15", "16", "17", "18", "19", "20"] },
  { key: "tokai", nameJa: "東海", prefixes: ["21", "22", "23", "24"] },
  { key: "kinki", nameJa: "近畿", prefixes: ["25", "26", "27", "28", "29", "30"] },
  { key: "chugoku", nameJa: "中国", prefixes: ["31", "32", "33", "34", "35"] },
  { key: "shikoku", nameJa: "四国", prefixes: ["36", "37", "38", "39"] },
  { key: "kyushu", nameJa: "九州・沖縄", prefixes: ["40", "41", "42", "43", "44", "45", "46", "47"] },
];

export type PrefsByRegion = { key: string; nameJa: string; prefs: PrefEntry[] };

/**
 * 与えた pref 配列（既定は PREFS 全件）を地方区分ごとにまとめ、地方は北→南、
 * 地方内は団体コード順に整列して返す。該当 pref が無い地方は省く（県別ページの
 * 「データのある県だけ」表示にも使えるよう、空グループは落とす）。
 */
export function prefsByRegion(prefs: PrefEntry[] = PREFS): PrefsByRegion[] {
  return REGIONS.map((r) => ({
    key: r.key,
    nameJa: r.nameJa,
    prefs: r.prefixes
      .map((px) => prefs.find((p) => p.codePrefix === px))
      .filter((p): p is PrefEntry => Boolean(p)),
  })).filter((g) => g.prefs.length > 0);
}

const BY_SLUG = new Map(PREFS.map((p) => [p.slug, p]));
const BY_PREFIX = new Map(PREFS.map((p) => [p.codePrefix, p]));

export function getPrefBySlug(slug: string): PrefEntry | null {
  return BY_SLUG.get(slug) ?? null;
}

/** 自治体コード（5桁）の先頭 2 桁から pref を引く */
export function getPrefByCode(code: string): PrefEntry | null {
  return BY_PREFIX.get(code.slice(0, 2)) ?? null;
}

export function listPrefSlugs(): string[] {
  return PREFS.map((p) => p.slug);
}
