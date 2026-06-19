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
  hyogo: {
    code: "28", nameJa: "兵庫県",
    bbox: { west: 134.253, south: 34.155, east: 135.469, north: 35.675 },
    hasWards: true,
    parentToWards: {
      "28100": ["28101","28102","28105","28106","28107","28108","28109","28110","28111"], // 神戸市9区
    },
  },
  nara: {
    code: "29", nameJa: "奈良県",
    bbox: { west: 135.540, south: 33.859, east: 136.230, north: 34.781 },
    hasWards: false,
    parentToWards: {},
  },
  wakayama: {
    code: "30", nameJa: "和歌山県",
    bbox: { west: 134.999, south: 33.433, east: 136.013, north: 34.384 },
    hasWards: false,
    parentToWards: {},
  },
  tottori: {
    code: "31", nameJa: "鳥取県",
    bbox: { west: 133.136, south: 35.058, east: 134.515, north: 35.615 },
    hasWards: false,
    parentToWards: {},
  },
  shimane: {
    code: "32", nameJa: "島根県",
    bbox: { west: 131.668, south: 34.302, east: 133.391, north: 37.248 },
    hasWards: false,
    parentToWards: {},
  },
  okayama: {
    code: "33", nameJa: "岡山県",
    bbox: { west: 133.267, south: 34.298, east: 134.413, north: 35.353 },
    hasWards: true,
    parentToWards: {
      "33100": ["33101","33102","33103","33104"], // 岡山市4区（北/中/東/南）
    },
  },
  hiroshima: {
    code: "34", nameJa: "広島県",
    bbox: { west: 132.036, south: 34.028, east: 133.471, north: 35.106 },
    hasWards: true,
    parentToWards: {
      "34100": ["34101","34102","34103","34104","34105","34106","34107","34108"], // 広島市8区
    },
  },
  yamaguchi: {
    code: "35", nameJa: "山口県",
    bbox: { west: 130.775, south: 33.713, east: 132.492, north: 34.799 },
    hasWards: false,
    parentToWards: {},
  },
  tokushima: {
    code: "36", nameJa: "徳島県",
    bbox: { west: 133.661, south: 33.539, east: 134.822, north: 34.252 },
    hasWards: false,
    parentToWards: {},
  },
  kagawa: {
    code: "37", nameJa: "香川県",
    bbox: { west: 133.447, south: 34.012, east: 134.447, north: 34.565 },
    hasWards: false,
    parentToWards: {},
  },
  ehime: {
    code: "38", nameJa: "愛媛県",
    bbox: { west: 132.012, south: 32.885, east: 133.693, north: 34.302 },
    hasWards: false,
    parentToWards: {},
  },
  kochi: {
    code: "39", nameJa: "高知県",
    bbox: { west: 132.480, south: 32.703, east: 134.315, north: 33.883 },
    hasWards: false,
    parentToWards: {},
  },
  fukuoka: {
    code: "40", nameJa: "福岡県",
    bbox: { west: 129.981, south: 33.000, east: 131.191, north: 34.250 },
    hasWards: true,
    parentToWards: {
      "40100": ["40101","40103","40105","40106","40107","40108","40109"], // 北九州市7区
      "40130": ["40131","40132","40133","40134","40135","40136","40137"], // 福岡市7区
    },
  },
  saga: {
    code: "41", nameJa: "佐賀県",
    bbox: { west: 129.737, south: 32.950, east: 130.542, north: 33.619 },
    hasWards: false,
    parentToWards: {},
  },
  nagasaki: {
    code: "42", nameJa: "長崎県",
    // 対馬・壱岐・五島など離島を含むため南北に広い（有人島は全て自治体なのでフルbbox）。
    bbox: { west: 128.104, south: 31.967, east: 130.390, north: 34.729 },
    hasWards: false,
    parentToWards: {},
  },
  kumamoto: {
    code: "43", nameJa: "熊本県",
    bbox: { west: 129.939, south: 32.095, east: 131.330, north: 33.195 },
    hasWards: true,
    parentToWards: {
      "43100": ["43101","43102","43103","43104","43105"], // 熊本市5区（中央/東/西/南/北）
    },
  },
  oita: {
    code: "44", nameJa: "大分県",
    bbox: { west: 130.825, south: 32.714, east: 132.177, north: 33.740 },
    hasWards: false,
    parentToWards: {},
  },
  miyazaki: {
    code: "45", nameJa: "宮崎県",
    bbox: { west: 130.703, south: 31.356, east: 131.886, north: 32.839 },
    hasWards: false,
    parentToWards: {},
  },
  kagoshima: {
    code: "46", nameJa: "鹿児島県",
    // 本土+種子島・屋久島のみ（south=30.0）。全域は奄美群島(27N)まで及びタイル数が膨大になるため、
    // 奄美群島・トカラ(十島村)の hazard はサンプル維持（人口/家賃/地価/施設/待機児童は全島とも実値）。
    bbox: { west: 129.415, south: 30.000, east: 131.205, north: 32.311 },
    hasWards: false,
    parentToWards: {},
  },
  okinawa: {
    code: "47", nameJa: "沖縄県",
    // 沖縄本島クラスタ（+久米島・伊平屋伊是名）のみ。全域は与那国(123E)〜大東(131E)で
    // span 8.4度=数万タイルになるため。宮古・八重山・大東の hazard はサンプル維持。
    bbox: { west: 126.708, south: 26.074, east: 128.336, north: 27.101 },
    hasWards: false,
    parentToWards: {},
  },
  aomori: {
    code: "02", nameJa: "青森県",
    bbox: { west: 139.497, south: 40.218, east: 141.683, north: 41.556 },
    hasWards: false,
    parentToWards: {},
  },
  iwate: {
    code: "03", nameJa: "岩手県",
    bbox: { west: 140.653, south: 38.748, east: 142.072, north: 40.450 },
    hasWards: false,
    parentToWards: {},
  },
  miyagi: {
    code: "04", nameJa: "宮城県",
    bbox: { west: 140.275, south: 37.773, east: 141.677, north: 39.003 },
    hasWards: true,
    parentToWards: {
      "04100": ["04101","04102","04103","04104","04105"], // 仙台市5区（青葉/宮城野/若林/太白/泉）
    },
  },
  akita: {
    code: "05", nameJa: "秋田県",
    bbox: { west: 139.692, south: 38.873, east: 140.995, north: 40.511 },
    hasWards: false,
    parentToWards: {},
  },
  yamagata: {
    code: "06", nameJa: "山形県",
    bbox: { west: 139.520, south: 37.734, east: 140.646, north: 39.216 },
    hasWards: false,
    parentToWards: {},
  },
  fukushima: {
    code: "07", nameJa: "福島県",
    bbox: { west: 139.165, south: 36.791, east: 141.046, north: 37.977 },
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
