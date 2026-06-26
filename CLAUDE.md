# CLAUDE.md

このファイルは、本リポジトリで作業する Claude Code (claude.ai/code) に向けたガイダンスです。

KurashiMap は、市区町村別の住みやすさ関連データ（家賃・地価・人口・子育て・災害リスク・生活インフラ）を地図上で比較できる、一般向け無料Webサービスです。Next.js 14 App Router + SSG、TypeScript、MapLibre GL を使用。全47都道府県・1,918自治体を政府統計の実データで収録しています（推計値・プレースホルダは一切なし）。

## コマンド

```bash
npm run dev          # next dev → http://localhost:3000
npm run build        # next build — 全自治体の詳細ページを静的生成
npm run lint         # next lint
npm run test         # vitest run（全テストを1回実行）
npm run test:watch   # vitest ウォッチモード
npx vitest run tests/lib/rentColor.test.ts   # 単一テストファイルの実行
```

テストは `node` 環境で実行され（vitest.config.ts）、Next と同様に `@/...` をリポジトリルートに解決します。なお `tsconfig.json` は `tests/` を Next の型対象から *除外* しているため、テストファイルは vitest 実行時のみ型付けされます。

`.env.local`（`.env.example` からコピー）は `scripts/` のデータ取得スクリプトを動かす場合**のみ**必要です。閲覧・ビルドに API キーは不要で、全データは `data/` 配下に JSON としてコミット済みです。

## アーキテクチャ

**2段階のデータ配信（中心的な設計）。** トップ地図は全 ~1,918 自治体ぶんの軽量な `MuniSummary[]`（検索・地図の色付け・行政区の分割に必要な最小フィールドのみ）を配信します。フルの `Municipality`（合計 ~1.8MB）はホームページには一切載せず、自治体を選択した時に `/api/muni/[code]` から1件だけ取得します。両方の型は `lib/types.ts`、ローダは `lib/metrics.ts`（`listSummaryAcrossPrefs` と `getMunicipality`）を参照。

**県別のコード分割。** `lib/prefs.ts` に `PREFS`（県ごとの slug・codePrefix・hasWards）と `loadPrefData` があり、テンプレートリテラルの動的 `import()` で `data/{slug}.json`（および `data/{slug}_wards.json`）を読み込みます。Next が県ごとに chunk を分割するため、必要な県だけがロードされます。`lib/metrics.ts` がこのアクセス層で、`code` の先頭2桁（=codePrefix）から `getPrefByCode` で県を引き、ロード済み県をキャッシュして検索します。

**`prefs` マニフェストが2つあり**、同期を保つ必要があります: `lib/prefs.ts`（アプリ用の TypeScript）と `scripts/_lib/prefs.mjs`（データスクリプトと CI マトリクス用）。県を追加する時は両方を変更します。

**地図の指標はデータ駆動。** `lib/mapMetrics.ts` が切替可能なコロプレス指標（`rent`・`landPrice`・`populationTrend`）を、MapLibre の `fill-color` 式・凡例・値整形をまとめた単一の `MapMetric` 型として定義します。`MapView.tsx` はこの定義から色・凡例・ツールチップを読み、ハードコードしません。家賃のしきい値と配色は `lib/rentColor.ts` にあり、固定の契約として扱います。

**ジオメトリ。** `public/prefectures.geojson`（全国の輪郭）は起動時にロード。`MapView.tsx` がビューポートに応じて県別ポリゴン geojson（`public/{slug}.geojson`、`{slug}_wards.geojson`）を遅延ロードします。

**UI 面。** `components/MapView.tsx`（MapLibre ラッパ）、`AreaPanel.tsx`（PC サイドパネル + MetricCards）、`MobileSheet.tsx`（モバイルの3段階ボトムシート）。詳細ページ: `app/area/[pref]/[city]/page.tsx`（SEO + 構造化データ）。OG画像の動的生成: `app/api/og/[code]/route.tsx`。

## データの扱い（honesty 方針・厳守）

欠損値は**決して**推計で埋めません。代わりに `source` 文字列にセンチネルを持たせ、UI が「データなし／対象外／区別非公表」を表示します。対象判定はヘルパーに集約されているので、独自に再実装せずこれらを使うこと:
- `lib/rentColor.ts` `hasRent` — 家賃（住宅統計の集計対象外な小町村 → グレー）
- `lib/landPrice.ts` `hasLandPrice` — 地価（標準地がない自治体 → 対象外）
- `lib/waitlist.ts` `isWaitlistDisclosed` — 待機児童（政令市は市単位集計。区別公表市と非公表市がある）
- `lib/coverage.ts` `isHazardEvaluated` / `isAmenitiesCounted` — ハザード・生活インフラ（reinfolib 圏外 → 対象外）
- `lib/foreignResidents.ts` `hasForeignData` / `foreignRatioPct` — 在留外国人（北方領土6村は調査対象外 → 対象外）。総数のみ収録し人口比は実行時算出（保存しない）。国籍内訳は出典の Power Pivot 制約で未収録（経緯は `docs/data-update.md` §7）
- `lib/shelters.ts` `hasShelterData` — 指定緊急避難場所（CSV対象外の自治体 → `未収録`センチネル。「0件」と「未収録」を区別）。地図は「災害オーバーレイON かつ 市区町村選択中」のとき災害種別に有効な避難場所を点でプロット（コロプレスにしない）。点は `data/{slug}_shelters.json`、`/api/shelters/[code]` で配信。経緯は `docs/data-update.md` §9

その他の固定制約: `lib/types.ts`・データスキーマ・家賃の色しきい値は安易に変えない。API キーはサーバー／スクリプト専用でクライアントに露出させない。**治安・犯罪データは扱わない**（法務方針）。

## データパイプライン

`scripts/` は1県ずつ実行します（例 `--pref=saitama`）。`build-base.mjs` が N03 から skeleton JSON + 簡略化 geojson を生成し（政令市は区を dissolve）、`fetch-*.mjs` 各スクリプトが e-Stat / reinfolib / 国土数値情報 / こども家庭庁 を出典に各指標を埋めます。`fetch-hazard.mjs` と `fetch-amenities.mjs` は `tilesForPolys()`（`scripts/_lib/reinfolib.mjs`、`tests/scripts/` でユニットテスト済）で自治体ポリゴンに交差するタイルだけを取得するため、広域bboxの県でも海上タイルを取得せずに済みます。スクリプト共通ヘルパーは `scripts/_lib/`（`data.mjs`・`estat.mjs`・`reinfolib.mjs`・`prefs.mjs`）にあります。

`.github/workflows/` の GitHub Actions がスケジュールでデータを更新し（`data-update-annual.yml`・`data-update-quarterly.yml`）、`main` にコミットします。一部の出典 URL／バージョン（CFA 待機児童 Excel、L01 地価公示の年度）はワークフロー内の env 変数で、毎年手動更新が必要です。Vercel の自動デプロイは無効（`vercel.json` の `deploymentEnabled: false`）で、デプロイは `deploy-preview.yml` の手動実行です。

ワークフローの仕様・更新頻度・手動更新箇所・手動実行手順・既知の注意点は **[`docs/data-update.md`](docs/data-update.md)** にまとめています。出典の年度更新やデータ更新 Action を触る時はまずこちらを参照。
