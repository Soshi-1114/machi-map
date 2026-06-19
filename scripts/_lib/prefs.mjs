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
  tokyo: {
    code: "13", nameJa: "東京都",
    // 島嶼部（伊豆諸島・小笠原）を除いた本土＋多摩のみ。
    // 全域 bbox は west:136 / east:154 に達し reinfolib タイル数が膨大になるため。
    bbox: { west: 138.93, south: 35.49, east: 139.95, north: 35.90 },
    hasWards: false,
    parentToWards: {},
  },
  kanagawa: {
    code: "14", nameJa: "神奈川県",
    bbox: { west: 138.916, south: 35.129, east: 139.836, north: 35.673 },
    hasWards: true,
    parentToWards: {
      "14100": ["14101","14102","14103","14104","14105","14106","14107","14108","14109","14110","14111","14112","14113","14114","14115","14116","14117","14118"],
      "14130": ["14131","14132","14133","14134","14135","14136","14137"],
      "14150": ["14151","14152","14153"],
    },
  },
  yamanashi: {
    code: "19", nameJa: "山梨県",
    bbox: { west: 138.180, south: 35.168, east: 139.134, north: 35.972 },
    hasWards: false,
    parentToWards: {},
  },
  nagano: {
    code: "20", nameJa: "長野県",
    bbox: { west: 137.325, south: 35.198, east: 138.739, north: 37.030 },
    hasWards: false,
    parentToWards: {},
  },
  gifu: {
    code: "21", nameJa: "岐阜県",
    bbox: { west: 136.276, south: 35.134, east: 137.653, north: 36.465 },
    hasWards: false,
    parentToWards: {},
  },
  shizuoka: {
    code: "22", nameJa: "静岡県",
    bbox: { west: 137.474, south: 34.572, east: 139.177, north: 35.646 },
    hasWards: true,
    parentToWards: {
      "22100": ["22101", "22102", "22103"],            // 静岡市（葵/駿河/清水）
      "22130": ["22138", "22139", "22140"],            // 浜松市（中央/浜名/天竜、R6再編後）
    },
  },
  aichi: {
    code: "23", nameJa: "愛知県",
    bbox: { west: 136.671, south: 34.574, east: 137.838, north: 35.425 },
    hasWards: true,
    parentToWards: {
      "23100": ["23101","23102","23103","23104","23105","23106","23107","23108","23109","23110","23111","23112","23113","23114","23115","23116"], // 名古屋市16区
    },
  },
  mie: {
    code: "24", nameJa: "三重県",
    bbox: { west: 135.853, south: 33.723, east: 136.990, north: 35.258 },
    hasWards: false,
    parentToWards: {},
  },
  shiga: {
    code: "25", nameJa: "滋賀県",
    bbox: { west: 135.764, south: 34.791, east: 136.455, north: 35.704 },
    hasWards: false,
    parentToWards: {},
  },
  kyoto: {
    code: "26", nameJa: "京都府",
    bbox: { west: 134.854, south: 34.706, east: 136.055, north: 35.779 },
    hasWards: true,
    parentToWards: {
      "26100": ["26101","26102","26103","26104","26105","26106","26107","26108","26109","26110","26111"], // 京都市11区
    },
  },
  osaka: {
    code: "27", nameJa: "大阪府",
    bbox: { west: 135.091, south: 34.272, east: 135.747, north: 35.051 },
    hasWards: true,
    parentToWards: {
      "27100": ["27102","27103","27104","27106","27107","27108","27109","27111","27113","27114","27115","27116","27117","27118","27119","27120","27121","27122","27123","27124","27125","27126","27127","27128"], // 大阪市24区
      "27140": ["27141","27142","27143","27144","27145","27146","27147"], // 堺市7区
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
