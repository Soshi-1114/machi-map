// fetch スクリプト共通: 都道府県メタデータ。
// 新規県を追加する時はここに entry を 1 行足す。

export const PREFS = {
  saitama: {
    code: "11",
    nameJa: "埼玉県",
    bbox: { west: 138.71, south: 35.74, east: 139.91, north: 36.29 },
    hasWards: true,
    parentToWards: {
      "11100": ["11101", "11102", "11103", "11104", "11105", "11106", "11107", "11108", "11109", "11110"],
    },
  },
  chiba: {
    code: "12",
    nameJa: "千葉県",
    bbox: { west: 139.74, south: 34.90, east: 140.88, north: 36.10 },
    hasWards: true,
    parentToWards: {
      "12100": ["12101", "12102", "12103", "12104", "12105", "12106"],
    },
  },
  gunma: {
    code: "10", nameJa: "群馬県",
    bbox: { west: 138.397, south: 35.985, east: 139.67, north: 37.059 },
    hasWards: false,
    parentToWards: {},
  },
  tochigi: {
    code: "09", nameJa: "栃木県",
    bbox: { west: 139.327, south: 36.201, east: 140.292, north: 37.155 },
    hasWards: false,
    parentToWards: {},
  },
  ibaraki: {
    code: "08", nameJa: "茨城県",
    bbox: { west: 139.688, south: 35.739, east: 140.852, north: 36.945 },
    hasWards: false,
    parentToWards: {},
  },
};

export function getPref(slug) {
  const p = PREFS[slug];
  if (!p) {
    throw new Error(`Unknown pref slug: ${slug}. Add it to scripts/_lib/prefs.mjs`);
  }
  return { slug, ...p };
}

/** CLI 引数 / 環境変数から pref を解決。デフォルト saitama */
export function resolvePref(argv) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--pref" && argv[i + 1]) return getPref(argv[i + 1]);
    if (argv[i].startsWith("--pref=")) return getPref(argv[i].slice("--pref=".length));
  }
  return getPref(process.env.PREF || "saitama");
}

/** data/{pref}.json と data/{pref}_wards.json のパスを返す */
export function dataPaths(rootDir, pref) {
  return {
    muni: `${rootDir}/data/${pref.slug}.json`,
    wards: pref.hasWards ? `${rootDir}/data/${pref.slug}_wards.json` : null,
  };
}
