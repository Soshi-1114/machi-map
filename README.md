# KurashiMap（kurashi-map）

市区町村別の住みやすさ関連データ（家賃相場・地価・人口・子育て・災害リスク・生活インフラ）を地図上で横断比較できる、一般向け無料Webサービスです。

地図が主役で、自治体を選ぶとサイドパネル（PC）／下部シート（SP）に要約＋数値が出て、詳細SEOページへ遷移します。

**全47都道府県・1,918自治体**（市区町村1,747＋政令市の行政区171）を、政府統計・国土数値情報の**実データ**で収録しています。

## 技術スタック

- Next.js 14（App Router、SSG）
- TypeScript
- MapLibre GL JS（地図基盤は OpenFreeMap Positron）
- デプロイ: Vercel

## セットアップ

```bash
npm install
npm run dev
# → http://localhost:3000
```

ビルド確認（全自治体の詳細ページを静的生成）:

```bash
npm run build
```

データ取得スクリプトを動かす場合のみ、`.env.example` を `.env.local` にコピーして API キーを設定します（閲覧・ビルドには不要）。`.env.local` はコミットしないでください。

- `REINFOLIB_API_KEY` … 国土交通省「不動産情報ライブラリ」（地価・ハザード・生活インフラ）
- `ESTAT_APP_ID` … e-Stat（人口・家賃）

## 主要構成

```
kurashi-map/
├ app/
│  ├ page.tsx                      # トップ＝全画面地図モード
│  ├ area/[pref]/[city]/page.tsx   # 自治体詳細ページ（SEO・構造化データ付き）
│  ├ api/og/[code]/route.tsx       # OG画像を動的生成
│  ├ api/muni/[code]/route.ts      # 自治体フルデータの取得API
│  ├ api/tile/[z]/[x]/[y]/route.ts # 地理院タイルの同一originプロキシ（OpenFreeMap fallback、現状未使用）
│  ├ sitemap.ts / robots.ts        # 全自治体URLのサイトマップ
├ components/
│  ├ MapView.tsx                   # MapLibreラッパ。県geojsonをビューポート遅延ロード
│  ├ AreaPanel.tsx                 # PCサイドパネル＋ MetricCards / buildSummary()
│  └ MobileSheet.tsx               # SP下部シート（3段階）
├ lib/
│  ├ types.ts                      # 【固定】Municipality 型・Metric 型
│  ├ metrics.ts                    # pref別JSONの動的importローダ（コード分割）
│  ├ prefs.ts                      # 47県の登録（PREFS）と loadPrefData
│  ├ rentColor.ts                  # 家賃→色＋データなし判定（hasRent）
│  ├ landPrice.ts / waitlist.ts / coverage.ts  # 欠損・非公表・対象外の判定ヘルパー
│  ├ summary.ts / related.ts / site.ts
├ data/
│  ├ {pref}.json                   # 市区町村データ（47県）
│  └ {pref}_wards.json             # 政令市の行政区データ
├ public/
│  ├ prefectures.geojson           # 47県の輪郭（起動時ロード）
│  └ {pref}.geojson / {pref}_wards.geojson  # 行政区域ポリゴン（簡略化済）
└ scripts/                         # データ取得・生成スクリプト（下記）
```

## データパイプライン

新規県の追加・再取得は `scripts/` を 1 県ずつ実行する（slug例 `--pref=saitama`）。

| スクリプト | 内容 | 出典 |
|---|---|---|
| `build-base.mjs` | N03から skeleton JSON＋簡略化geojsonを生成（政令市は区をdissolve） | 国土数値情報 N03 |
| `fetch-population-2025.mjs` | 人口・増減トレンド | 令和7年(2025)国勢調査 速報 |
| `fetch-rent.mjs` | 民営借家中央値 | 住宅・土地統計調査（e-Stat） |
| `fetch-land-price.mjs` | 住宅地地価 | 地価公示／都道府県地価調査（L01/L02） |
| `fetch-hazard.mjs` | 浸水想定・土砂災害警戒区域 | 国土数値情報（reinfolib XKT026/029） |
| `fetch-amenities.mjs` | 駅・保育園等・医療機関の数 | 国土数値情報（reinfolib XKT015/007/010） |
| `fetch-waitlist.mjs` | 待機児童数 | こども家庭庁 保育所等関連状況取りまとめ |

`fetch-hazard` / `fetch-amenities` は `tilesForPolys()` で**自治体ポリゴンに交差するタイルだけ**を取得するため、北海道や離島県のような広域bboxでも海上タイルを取得せずに済む。

## データの扱い（honesty 方針）

欠損を推計値で埋めず、`source` 文字列のセンチネルで UI が「データなし／対象外／区別非公表」を表示する。

- **家賃**: 住宅統計の対象外な小町村は `データなし（住宅統計の集計対象外）`（地図はグレー）
- **地価**: 地価公示・調査の標準地がない自治体（北方領土・帰還困難区域・小離島）は `対象外`
- **待機児童**: 政令市は市単位集計。区別公表市は実値、非公表市は `区別非公表（◯◯市全体でN人）`
- **ハザード／生活インフラ**: reinfolib 圏外の北方領土は `対象外`

判定は `lib/rentColor.hasRent` / `lib/landPrice.hasLandPrice` / `lib/waitlist.isWaitlistDisclosed` / `lib/coverage.isHazardEvaluated・isAmenitiesCounted` に集約。サンプル/推計プレースホルダは収録していない（0件）。

## 設計原則（守ること）

- 型（`lib/types.ts`）・データスキーマ・家賃の色しきい値（`lib/rentColor.ts`）は安易に変えない。
- API キーはサーバー側／取得スクリプトのみで使用し、クライアントに露出させない。
- **治安・犯罪データは扱わない**（法務方針）。
- 欠損は推計で埋めず `データなし／対象外` と明示する（上記 honesty 方針）。

## 出典クレジット

- 地図基盤: [OpenFreeMap Positron](https://openfreemap.org/)（OpenStreetMap データ、OpenMapTiles スキーマ、CC0 / ODbL）
- 行政区域: 国土数値情報「行政区域データ（N03）」
- 人口: 総務省統計局「国勢調査」（e-Stat 経由）
- 家賃: 総務省統計局「住宅・土地統計調査」（e-Stat 経由）
- 地価・ハザード・生活インフラ: 国土交通省「不動産情報ライブラリ」（reinfolib）／国土数値情報
- 待機児童: こども家庭庁「保育所等関連状況取りまとめ」ほか各政令市公表値

## ライセンス

未定（内部開発用）。
