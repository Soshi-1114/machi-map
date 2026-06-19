// 全指標共通の値の型。APIに差し替えてもこの型は変えない。
export type Metric = {
  value: number;
  unit: string;          // "円/月", "円/㎡", "人" など
  source: string;        // 出典表記
  asOf: string;          // 基準時点 "2023" など
  isEstimated: boolean;  // 推計値フラグ（欠落町村の補完等）
};

export type HazardInfo = {
  hasFloodRisk: boolean;
  hasLandslideRisk: boolean;
  note: string;          // "荒川沿いに浸水想定" など
  source: string;
  asOf: string;
};

export type AdminLevel = "muni" | "ward"; // 市区町村 / 政令市の行政区

export type Municipality = {
  code: string;          // 全国地方公共団体コード 例 "11203"（市区町村） / "11107"（区）
  pref: string;          // "saitama"（URL用スラッグ）
  name: string;          // "川口市" / "浦和区"
  level?: AdminLevel;    // 既定は "muni"。"ward" の場合は parentCode 必須を想定
  parentCode?: string;   // ward の親市コード 例 "11100"
  displayName?: string;  // 表示用フルネーム 例 "さいたま市浦和区"。指定無ければ name にフォールバック
  population: number;
  populationTrend: "増加" | "微増" | "横ばい" | "微減" | "減少";
  rent: Metric;          // 民営借家中央値
  landPrice: Metric;     // 住宅地地価
  waitlistChildren: Metric; // 待機児童（value=人数）
  hazard: HazardInfo;
  amenities?: {
    stations: number;            // 駅数
    preschools: number;          // 保育園・幼稚園・認定こども園 合計
    medicalFacilities: number;   // 医療機関（病院・診療所等）合計
    source: string;
    asOf: string;
  };
};

// トップ地図の初期配信用の軽量サマリ。検索・地図の色付け・自治体分割に必要な
// 最小フィールドのみ（全1923自治体ぶんを積んでも軽い）。詳細は選択時に
// /api/muni/[code] でフル Municipality を取得する。
export type MuniSummary = {
  code: string;
  pref: string;
  name: string;
  displayName?: string;
  level?: AdminLevel;
  parentCode?: string;
  rent: number;          // rent.value（円/月）
  hasFloodRisk: boolean;  // hazard.hasFloodRisk
};
