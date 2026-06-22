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
  // 段階値（順序尺度）。新データのみ持つ。未設定の旧データは has*Risk の boolean に
  // フォールバックする（lib/hazardScale.ts のアクセサ参照）。
  floodLevel?: number;     // 浸水深ランク 0=なし,1..6（reinfolib XKT026）
  landslideLevel?: number; // 0=なし,1=警戒区域,2=特別警戒区域（reinfolib XKT029）
  // 津波・高潮（沿岸のみ）。level: -1=対象外（内陸県等）, 0=想定なし, 1..8=深さランク。
  // depth: 最大深バンドの表示ラベル（例 "3m以上 ～ 5m未満"）。あり(level>=1)のときのみ。
  tsunamiLevel?: number;     // reinfolib XKT028（A40_003）
  tsunamiDepth?: string;
  stormSurgeLevel?: number;  // reinfolib XKT027（A49_003）
  stormSurgeDepth?: string;
  // 液状化（reinfolib XKT025）。level は小さいほど高リスク（1=非常に〜5=しにくい）。
  // -1=未評価（メッシュなし）。label は最悪メッシュの傾向テキスト（"非常に液状化しやすい" 等）。
  liquefactionLevel?: number;
  liquefactionLabel?: string;
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
  landPrice: number;     // landPrice.value（円/㎡）。<=0 はデータなし
  populationTrend: Municipality["populationTrend"]; // 人口トレンド（地図の塗り分け用）
  // 浸水深ランク。-1=評価対象外（reinfolib圏外）, 0=なし, 1..6（lib/hazardScale.ts）。
  // 旧 hasFloodRisk(>0)・hazardEvaluated(>=0) を1フィールドに集約。地図の濃淡と
  // 「浸水深◯m以下」フィルタの単一ソース。
  floodLevel: number;
  // 地図のハザード・オーバーレイ切替（lib/mapHazards.ts）用の数値レベルのみ。
  // ラベル/深さ文字列は詳細ページ（フル Municipality）側に置きサマリは軽量に保つ。
  landslideLevel: number;     // -1=対象外, 0=なし, 1=警戒区域, 2=特別警戒区域
  tsunamiLevel: number;       // -1=対象外, 0=想定なし, 1..8（深いほど高リスク）
  stormSurgeLevel: number;    // 同上
  liquefactionLevel: number;  // -1=未評価, 1..5（小さいほど高リスク）
};
