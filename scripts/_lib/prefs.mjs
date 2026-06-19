// fetch スクリプト共通: 都道府県メタデータ。
// 新規県を追加する時はここに entry を 1 行足す。

export const PREFS = {
  saitama: {
    code: "11",
    nameJa: "埼玉県",
    bbox: { west: 138.71, south: 35.74, east: 139.91, north: 36.29 },
    hasWards: true,
    /** 政令市 親コード → 子区コード列 */
    parentToWards: {
      "11100": ["11101", "11102", "11103", "11104", "11105", "11106", "11107", "11108", "11109", "11110"],
    },
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
