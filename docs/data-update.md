# データ更新（GitHub Actions）運用ドキュメント

KurashiMap の各指標データは GitHub Actions が定期/手動で取得し、`data/*.json` を
`main` に直接コミットする。本書はその2ワークフローの仕様・更新頻度・手動更新箇所・
運用手順・既知の注意点をまとめる。

- ワークフロー定義: `.github/workflows/data-update-annual.yml` / `data-update-quarterly.yml`
- 取得スクリプト: `scripts/fetch-*.mjs`（共通処理は `scripts/_lib/`）
- 県マニフェスト: `scripts/_lib/prefs.mjs`（CI マトリクス用）と `lib/prefs.ts`（アプリ用）

---

## 1. 全体像

| ワークフロー | 取得元 | 対象指標 | 更新頻度（cron） | 必要 Secret |
|---|---|---|---|---|
| **annual** (`data-update-annual.yml`) | e-Stat / 国土数値情報 L01 / こども家庭庁 Excel | 人口・家賃・地価・待機児童 | 年1回 3/15 04:00 JST | `ESTAT_APP_ID` |
| **quarterly** (`data-update-quarterly.yml`) | 不動産情報ライブラリ reinfolib | 災害リスク・生活インフラ（駅/保育/医療） | 四半期 1/1・4/1・7/1・10/1 04:00 JST | `REINFOLIB_API_KEY` |

どちらも `main` へは直接 push せず、**単一 PR を自動作成**して反映する（PR をマージで反映）。
取得元の性質に合わせて取得形態が異なる:
- **annual**: 人口/家賃(e-Stat)・待機児童(CFA)は **全国を1回でまとめ取得**、地価(L01)は県別 zip を
  逐次取得。これらを **1ジョブ**で行い単一 PR を作る。
- **quarterly**: reinfolib は地理タイル単位のため **県ごとに並列 fetch → アーティファクト化 →
  集約ジョブ(open-pr)が単一 PR** を作る。

ビルド/デプロイは行わない（Vercel 自動デプロイは無効。反映は `deploy-preview.yml` の手動実行）。

> なぜ annual は全国まとめ取得か: e-Stat の統計表は全国1テーブルで、`cdArea` で絞るだけ。
> 旧方式（県別47ジョブが各自 e-Stat へ接続）は毎回2-3県が接続タイムアウトし、CFA を47回DL
> していた。全国まとめ取得＋リトライで接続バースト・冗長 DL を排除した。

---

## 2. annual ワークフロー

### スケジュール
- cron `0 19 14 3 *` = **3/14 19:00 UTC = 3/15 04:00 JST**。
- こども家庭庁の待機児童 Excel が前年夏〜秋に公開済みである前提。

### ジョブ構成（単一ジョブ `update`）
`workflow_dispatch` の `pref` 入力があればその1県のみ、空なら全県（`--all`）。

1. checkout / setup-node / `npm ci`
2. **待機児童 Excel を1回だけ DL**（全県共通）
3. `fetch-population-2025.mjs --all`（人口・国勢調査, e-Stat）— 全国の全コードを100件チャンクで
   まとめ取得（~19req/指標）し各県へ分配
4. `fetch-rent.mjs --all`（家賃・住宅土地統計, e-Stat）— 同上
5. `fetch-waitlist.mjs --all`（待機児童, CFA）— Excel を1回パースして全県へ反映
6. 地価ループ（県別）: 各県の L01 zip を DL（3回リトライ）→ `fetch-land-price.mjs --pref=X`。
   県別の失敗は `::warning::` で記録し継続（他県は止めない）
7. `data/` に差分があれば単一 PR（ブランチ `data/annual-{run_id}`）を `gh` CLI で作成

> e-Stat/CFA は全国まとめ取得なので接続回数が激減し、`estat.mjs` のリトライ＋タイムアウトと
> 併せて接続タイムアウトはほぼ起きない。地価のみ県別 zip のため逐次。

### 手動更新が必要な env（毎年）
`.github/workflows/data-update-annual.yml` の `env:`

| 変数 | 意味 | 更新方法 |
|---|---|---|
| `L01_VERSION` | 地価公示 L01 の zip バージョン（現在 `"26"` = 令和8年/2026） | 翌年の L01 公開後に番号を +1。`https://nlftp.mlit.go.jp/ksj/gml/data/L01/L01-{N}/L01-{N}_{code}_GML.zip` が 200 を返すか確認 |
| `L01_ASOF` | 地価の出典表示の年（現在 `"2026"`） | **`L01_VERSION` と必ず同期**（`fetch-land-price.mjs` の `asOf` に入る） |
| `CFA_XLSX_URL` | こども家庭庁 待機児童 Excel の URL（現在 令和7年/2025-04-01 版 `_r7_02.xlsx`） | 下記「CFA Excel の選び方」参照 |

#### CFA Excel の選び方（重要）
`fetch-waitlist.mjs` は Excel 内のシート **「資料６－１」「資料６－２」** を読む。
これらは公表ページの **「（参考）資料1～6」** という Excel に入っている。

- **ファイル名末尾の採番は年度で変わる**（令和6年=`_r6_03.xlsx` / 令和7年=`_r7_02.xlsx`）。
  番号で機械的に推測せず、必ず公表ページのラベル「（参考）資料1～6」のリンクを使う。
- 公表ページ: こども家庭庁「保育所等関連状況取りまとめ（令和N年4月1日）」
  例: https://www.cfa.go.jp/policies/hoiku/torimatome/r7
- 差し替え後は `asOf` も合わせる必要がある（次項）。

#### asOf の同期（誠実性方針）
CFA の年度を上げたら、`scripts/fetch-waitlist.mjs` 内の `asOf`（2箇所、現在
`"2025-04-01"`）も新年度の基準日に更新する。URL だけ替えると出典年と実データが
食い違い、`source`/`asOf` 表示が誤る。

#### 差し替え前の検証手順（推奨）
```bash
# 1. 候補 Excel を取得
curl -sL -o /tmp/cfa.xlsx "<新しいCFA_XLSX_URL>"
# 2. 対象シートと抽出可否を確認（資料６－１/６－２が存在し、県|市区町村|人数 が取れるか）
node -e 'const X=require("xlsx");const wb=X.readFile("/tmp/cfa.xlsx");console.log(wb.SheetNames)'
# 3. L01 の存在確認
curl -s -o /dev/null -w "%{http_code}\n" -I \
  "https://nlftp.mlit.go.jp/ksj/gml/data/L01/L01-26/L01-26_13_GML.zip"
```

---

## 3. quarterly ワークフロー

### スケジュール
- 1/1・4/1・7/1・10/1 の 04:00 JST（= 各前日 19:00 UTC）。月末日が異なるため cron を2本に分割:
  - `0 19 31 12,3 *` → 12/31・3/31 UTC（1/1・4/1 JST）
  - `0 19 30 6,9 *` → 6/30・9/30 UTC（7/1・10/1 JST）
- ※以前は `0 19 31 12,3,6,9 *` の単一 cron で、6月/9月に31日が無く 7/1・10/1 が発火しない
  不具合があった（修正済み。詳細は「既知の注意点」）。

### ジョブ構成
1. `resolve-prefs`: 対象 slug 一覧（annual と同様）。
2. `fetch`（県ごとの matrix, `max-parallel: 3` = reinfolib 過負荷防止）:
   - reinfolib タイルキャッシュを `actions/cache` で復元（`.cache/reinfolib-tiles/{pref}`）
   - `fetch-hazard.mjs`（浸水/土砂/津波/高潮/液状化, reinfolib XKT026/029/028/027/025）
     - 浸水は浸水深ランク `floodLevel` 1..6（A31a_205 の市域内最大）、土砂は区域区分
       `landslideLevel` 1=警戒/2=特別警戒（A33_002 の最大）を段階値で保持。note に河川名
       （A31a_202）・現象種類（A33_001）を付す。段階の意味は `lib/hazardScale.ts` と同期。
     - 津波 `tsunamiLevel`/`tsunamiDepth`（A40_003）・高潮 `stormSurgeLevel`/`stormSurgeDepth`
       （A49_003）は沿岸県のみ。深さは文字列バンドなので下限mを抽出してランク化、最大バンドを
       表示用に保持。**内陸8県（栃木/群馬/埼玉/山梨/長野/岐阜/滋賀/奈良）は対象外（level=-1）**で
       XKT028/027 を取得しない。沿岸県の内陸自治体は `想定なし`(level=0)。
     - 液状化 `liquefactionLevel`/`liquefactionLabel`（XKT025, 全国メッシュ）。
       `liquefaction_tendency_level` は **小さいほど高リスク**（1=非常に液状化しやすい 〜
       5=液状化しにくい）なので、市域内の**最悪=最小レベル**を採用（内部では順位を反転して
       最大を取る）。label は最悪メッシュの傾向テキスト。メッシュなし=`-1`(未評価)で非表示。
     - 評価対象外（北方領土など reinfolib 圏外）の `source` センチネルは上書きしない。
     - reinfolib のハザード属性名を実データで確認するには `scripts/probe-hazard-attrs.mjs`
       （`node --env-file=.env.local scripts/probe-hazard-attrs.mjs`）。
   - `fetch-amenities.mjs`（駅/保育・幼稚園/医療機関, reinfolib XKT015/007/010）
   - 変更後データをアーティファクト `data-{pref}` にアップロード（main へは push しない）
3. `open-pr`（`needs: fetch`, `if: always()`）: 全アーティファクトを集約して単一 PR を作成。

> `tilesForPolys()`（`scripts/_lib/reinfolib.mjs`）で自治体ポリゴンに交差するタイルだけ
> 取得するため、広域 bbox の県でも海上タイルを取得しない。

---

## 4. 手動実行の手順

GitHub の **Actions** タブ → 対象ワークフロー → **Run workflow**。

- `pref` 入力: 1県だけ更新したい時に slug（例 `tokyo`）を指定。空欄で全47県。
- 全県実行は時間がかかる（特に quarterly の reinfolib）。新しい出典に差し替えた直後の
  動作確認は、まず1県（例 `saitama`）で試すのが安全。
- 実行後、`open-pr` ジョブが **単一 PR**（ブランチ `data/annual-{run_id}` 等）を作成する。
  内容を確認して **PR をマージ**すると `data/*.json` が `main` に反映される。
  全県で差分が無ければ PR は作られない（正常）。
- 一部の県が fetch で失敗（例: e-Stat 接続タイムアウト）しても、成功県ぶんは PR に載る。
  失敗県は後から単県で再実行すればよい。

---

## 5. データソースと公表サイクル（参考）

| 指標 | 出典 | 出典の公表サイクル | 取得スクリプト |
|---|---|---|---|
| 家賃 | 総務省 住宅・土地統計調査（e-Stat） | 5年ごと | `fetch-rent.mjs` |
| 人口/人口トレンド | 総務省 国勢調査（e-Stat） | 5年ごと | `fetch-population-*.mjs` |
| 地価 | 国交省 地価公示 L01（国土数値情報） | 年1回（1/1時点・3月公表） | `fetch-land-price.mjs` |
| 待機児童 | こども家庭庁 保育所等関連状況取りまとめ | 年1回（4/1時点・夏〜秋公表） | `fetch-waitlist.mjs` |
| 災害リスク | reinfolib XKT026/029 | 不定期（随時） | `fetch-hazard.mjs` |
| 生活インフラ | reinfolib XKT015/007/010 | 年度更新 | `fetch-amenities.mjs` |

> annual は家賃・人口を毎年再取得するが、出典が5年周期なので新調査公表までは差分なし
> （no-op）。実質の更新は出典の公表に従う。

---

## 6. 既知の注意点 / 課題

> 過去に下記の不具合があり修正済み（記録として残す）:
> - **人口取得スクリプト名の不一致**: ワークフローが `scripts/fetch-population.mjs` を呼ぶ一方、
>   実ファイルは `scripts/fetch-population-2025.mjs`（リファクタ時のリネームで参照が取り残された）。
>   当該ステップが `Cannot find module` で失敗し、直列ゆえ同じ県の rent/land/waitlist も
>   未更新になっていた。→ ワークフローの参照名を実ファイルに合わせて解消。国勢調査の年度が
>   変わって新スクリプトを作る際は、ここの参照名も合わせて更新すること。
> - **quarterly cron が年2回しか発火しない**: `0 19 31 12,3,6,9 *` は6月/9月に31日が無く
>   7/1・10/1 が発火しなかった。→ `0 19 31 12,3 *` と `0 19 30 6,9 *` の2本に分割して解消。
> - **各県 main 直 push のレースで多数失敗**: 47県の並列 job が同時に `git push origin HEAD:main`
>   していたため、リトライを入れても競合（non-fast-forward）で大半が失敗していた。
>   → 書き込みを1ジョブ（annual=単一ジョブ / quarterly=open-pr 集約）に集約し、単一 PR を
>   作成する方式に変更してレースを構造的に排除。
> - **e-Stat 接続タイムアウトで毎回2-3県が失敗**: 47ジョブが各自 e-Stat へ接続し、
>   `UND_ERR_CONNECT_TIMEOUT`（接続10秒）でランダムに2-3県が落ちていた。
>   → annual を**全国まとめ取得**（接続回数を激減）＋ `estat.mjs` に**リトライ＋タイムアウト**を
>   入れて解消。
> - **地価の asOf ドリフト**: `L01_VERSION` を 26 に上げた際、`fetch-land-price.mjs` の
>   `asOf` が `"2025"` ハードコードのままで、2026 データを 2025 と表示していた。
>   → `L01_ASOF` env 駆動（既定 "2026"）に変更し、`L01_VERSION` と同期させる運用に。

1. **手動更新の env を毎年忘れない**
   `L01_VERSION` / `L01_ASOF` / `CFA_XLSX_URL` は自動更新されない。出典公開時期（地価=3月、
   待機児童=夏〜秋）に合わせて更新し、`fetch-waitlist.mjs` の `asOf` も同期する。

2. **反映は単一 PR 方式**
   `main` への直 push は行わず、PR（`data/annual-{run_id}` 等）を作成 → マージで反映。
   bot の PR 作成には `permissions: pull-requests: write`、`GITHUB_TOKEN`（`gh` CLI）、および
   リポジトリ設定「Allow GitHub Actions to create and approve pull requests」の有効化が必要。
