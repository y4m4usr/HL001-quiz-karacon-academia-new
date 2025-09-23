ありがとうございます。
いただいた **Colabノートブック／GitHubリポジトリ／スプレッドシート** を前提に、**「Colabで画像→GitHubにアップロード→クイズ画面でGitHub画像を参照（レンズ画像×2／正解時サムネ）」** という流れを、そのまま **Codex（コード生成AI）に実装させるための指示プロンプト** を用意しました。

> ※補足：
>
> * GitHub リポジトリ構成（`index.html`, `quiz-override.js` などの存在）は公開リポジトリで確認できました。([GitHub][1])
> * スプレッドシートには、商品マスタとカテゴリ、並びに **画像格納フォルダ（image\_lens / image\_samune）**、各スプレッドシートIDがまとまっています（`109販促データ`/`カラーカテゴリ`、「サムネ画像」「レンズ画像」列の存在も読み取れます）。([Google Docs][2])
> * アプリ側の確定仕様として **「画像は同一画像×2枚並列」「正解時にサムネ表示」「データ完備商品のみ出題」「タイムアウトは未回答扱い(-10%)」「2秒表示→自動遷移」** などが定義されていますので、プロンプト内に反映済みです。
> * 参考UIのデモHTML（`feedbackModal`や`lens-display`の見た目・流れ）に沿って、画像差し替えポイントを具体化しています。
> * 本プロジェクトは「AI主導・一貫した環境・設定値の外出し」が開発哲学です。生成コードでも **環境変数** 利用・**再実行に強い** 構成・**GitHub管理** を明示しています。
> * 画像素材の格納先として`parts/`配下を前提に命名・配置ポリシーを一本化しています。

---

## ✅ コピペ用：Codex への指示プロンプト（長文・そのまま貼り付けOK）

> 役割
> あなたはフルスタックエンジニアAIです。既存のColabツールで「画像をGitHubへアップロードし、クイズ画面はGitHub上の画像を参照」する運用を、**頑健で再実行に強い実装**として整理・コード化します。実装は **最小構成でMVP優先**、かつ **再現性・保守性・速度** を重視してください。

> 目的（要件の要点）
>
> 1. **Colab → GitHub**：`image_lens`/`image_samune`の画像を整理し、GitHubリポジトリへ所定パスでアップロード（新規/更新を吸収）。
> 2. **メタ生成**：アップロード結果の **インデックスJSON**（`parts/index.json`）を生成（ブランド/カラー/スペック/画像URL）。
> 3. **フロント改修**：クイズ画面で
>
> * レンズ画像を **同一画像×2枚** 並列表示（問題文エリア）。
> * **正解時のフィードバック**に **サムネ画像** を表示。
> * **データ完備の商品だけを出題**。
> * 画像エラー時は **プレースホルダ** にフォールバック。
> * **2秒表示→自動で次へ**、**タイムアウトは未回答扱い(-10%)** を維持。
>
> 4. **環境**：設定値は.env相当で外出し／GitHub管理（CI前提でOK）／NodeやGASと共存しても壊れない構造。
> 5. **フォント**：UIテキストは `font-family: "Noto Sans JP", system-ui, sans-serif;` を指定（文字化け対策）。

> 参照リソース
>
> ```txt
> # GitHub（公開）
> リポジトリ: https://github.com/y4m4usr/HL001-quiz-karacon-academia-new
> ブランチ: main
>
> # Google Sheets（一覧）
> HL001_Spreadsheet一覧表:
> https://docs.google.com/spreadsheets/d/1QtwI1VF-RtHmVQdPA1IttDtRAJaOj4FJHN6meCIbEEk/edit?usp=sharing
>  - 109販促データ（本番マスタ）: ID=1EkTjV__k1vAl08PlbOUhYpbFEGC-F_LL_26o1-HT1AI, タブ: master（ブランド/カラー/DIA/G.DIA/BC/画像列 等）
>  - カラーカテゴリ: 同ブック内タブ or 付随シート（カテゴリ・ダミー誤答抽出に使用）
>  - 画像格納フォルダ: image_lens / image_samune（Google Drive）
> ```
>
> * 仕様メモ：出題は「データ完備」のみ／「画像は同一×2」／「正解でサムネ」／「タイムアウト(-10%)」／「フィードバック2秒→自動進行」。
> * UIメモ：`feedbackModal` 等の既存構造に追従。必要最小限のDOM置換で差し替え。

> 成果物（ファイル追加・変更の一覧と中身）
> **A. Colab／Python側（再利用可能スクリプト）**
>
> * `tools/image_uploader.py`（新規・Python）
>
>   * 役割：Google Sheetsを読み、Driveの元画像を取り出し、**ファイル名の正規化**・**最適化**・**GitHubへアップロード**・**index.json生成** を一括実行。
>   * 実装詳細：
>
>     1. **設定**（ハードコード禁止）：
>
>        * `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH`（例: main）, `GITHUB_TOKEN`（env）
>        * `SHEET_MASTER_ID`（= 1EkTjV\_\_…），必要なら `SHEET_CATEGORY_ID`
>        * DriveフォルダID（`image_lens`, `image_samune`）は定数化。
>     2. **行フィルタ**：必須列（ブランドカナ, カラーカナ, DIA, G.DIA, BC, 画像パス等）が **全て埋まっている行のみ** 対象。
>     3. **スラグ化**：`brandKana + "_" + colorKana` をベースに **ローマ字スラグ**（`pykakasi`等で変換、`lowercase-hyphen`）。
>     4. **画像処理**：`Pillow`で
>
>        * レンズ：正方形センタークロップ→**480×480** → `webp`（品質85, progressive）。
>        * サムネ：長辺基準**640px**縮小 → `webp`。
>        * **最小化**（EXIF除去、カラープロファイル簡素化）。
>     5. **GitHubアップロード**（REST `PUT /repos/{owner}/{repo}/contents/{path}`）：
>
>        * パス：
>
>          * レンズ：`parts/lens/{slug}.webp`
>          * サムネ：`parts/thumb/{slug}.webp`
>          * プレースホルダ：`parts/placeholder.webp`（無ければ最初に一度だけ作成）
>        * 既存チェック：`GET /contents` で `sha`取得→**idempotent** に更新。
>        * コミットメッセージ例：`chore(assets): add lens/thumb for {brandKana}-{colorKana}`
>     6. **index.json 生成**（`parts/index.json`）：
>
>        * 要素：
>
>          ```json
>          {
>            "key": "{slug}",
>            "brandKana": "...",
>            "colorKana": "...",
>            "dia": "14.2",
>            "gDia": "13.4",
>            "bc": "8.6",
>            "imageUrl": "https://cdn.jsdelivr.net/gh/{owner}/{repo}@{branch}/parts/lens/{slug}.webp",
>            "thumbUrl": "https://cdn.jsdelivr.net/gh/{owner}/{repo}@{branch}/parts/thumb/{slug}.webp",
>            "comment": "..."
>          }
>          ```
>        * **CDNは jsDelivr** を標準（`raw`直より高速・キャッシュ良）。
>     7. **（任意）書き戻し**：シートに `レンズマスター`/`サムネマスター` 列があれば、各URLをアップサート。
>   * 要件：**再実行で壊れない**／**エラーでも続行**（ログ警告＋スキップ）／**並列化はほどほど**（API制限に配慮）。
>   * 依存：`gspread`, `google-auth`, `pykakasi`, `Pillow`, `requests`, `python-dotenv`

> **B. フロントエンド（最小改修）**
>
> * 既存：`index.html` / `quiz-override.js`（または同等のクイズ制御JS）を **差分最小** で以下に改修。
>
>   1. **フォント**：
>
>      ```html
>      <style>
>        html,body { font-family: "Noto Sans JP", system-ui, -apple-system, "Segoe UI", "Hiragino Sans", "Meiryo", sans-serif; }
>      </style>
>      ```
>   2. **データロード**：起動時に `parts/index.json` を `fetch` し、
>
>      * **必須フィールド充足**の要素だけにフィルタ（brandKana, colorKana, dia, gDia, bc, imageUrl, thumbUrl）。
>      * 出題候補プールを構築。
>   3. **レンズ画像×2**：問題描画で
>
>      ```html
>      <div class="lens-display">
>        <img id="leftLens"  class="lens-img"  decoding="async" loading="lazy" alt="">
>        <img id="rightLens" class="lens-img" decoding="async" loading="lazy" alt="">
>      </div>
>      ```
>
>      `src`に `imageUrl` を設定し、`onerror` で `parts/placeholder.webp` へフォールバック。
>   4. **正解フィードバック**：`feedbackModal`（既存構造）内に
>
>      ```html
>      <img id="feedbackThumb" style="width:100%;border-radius:12px;display:block;margin:12px 0;" alt="thumbnail">
>      ```
>
>      を追加し、正解時に `thumbUrl` をセット（`onerror` プレースホルダ）。**2秒表示→自動で次へ**。
>   5. **タイムアウト**：既存ロジックに従い、**未回答扱い(-10%)** を維持。
>   6. **出題条件**：`index.json`からの **データ完備のみ** を選定。
>   7. **キャッシュ**：`?v={commitHash or index.jsonのETag}` を付与してキャッシュ更新。
>   8. **アクセシビリティ**：`alt` テキストに `brandKana + colorKana` を入れる。

> 実装手順（AIが自動でコードを生成・修正するための具体指示）
>
> 1. `tools/image_uploader.py` を新規作成：上記Aのとおりクラス/関数分割し、`main()`で一括実行可。
> 2. Colab向けに `examples/colab_driver.ipynb` も生成：
>
>    * `.env`の読み込み（`GITHUB_TOKEN` 等）
>    * `from tools.image_uploader import main; main()` で実行できる形。
> 3. 画像が無い場合の **`parts/placeholder.webp`** を自動生成（シンプルな灰色背景に“NO IMAGE”）し、最初のコミットでアップロード。
> 4. `parts/index.json` を生成・アップロード。
> 5. フロント改修：`index.html` と `quiz-override.js` を差分最小で以下を反映：
>
>    * レンズ表示DOMを `<img>` に変更、`src` を `imageUrl` に。
>    * フィードバックモーダルに `#feedbackThumb` を追加、正解時に `thumbUrl` を表示。
>    * フォールバックと2秒オートネクストを実装。
> 6. **テスト**：
>
>    * 画像あり製品／画像なし製品／壊れたURLでのフォールバック。
>    * タイムアウト挙動（-10%）と2秒遷移。
>    * `index.json` が空／不整合時の安全終了（UIに再試行ボタン）。
> 7. **成果物**：PRで差分と動作GIFを添付。READMEに簡易手順追記。

> 受け入れ条件（Acceptance Criteria）
>
> * Colabから一回実行するだけで、`parts/` 以下に **レンズ/サムネ/プレースホルダ/index.json** が **GitHubに上がる**。
> * クイズ画面で **同一レンズ画像×2** が表示され、**正解時にサムネ画像**がモーダルに表示される。
> * **データ未完備な行は出題対象にならない**。
> * 画像が壊れていても **プレースホルダ表示で進行が止まらない**。
> * **2秒後に自動で次の問題**／**タイムアウトは未回答(-10%)**。
> * 設定値は.envに分離し、**トークンの直書きなし**。
> * 文言は `Noto Sans JP` 前提で文字化けしない。

> 追加実装のヒント（AI裁量）
>
> * 画像URLは **jsDelivr** を既定にし、帯域とキャッシュ最適化。
> * `index.json` に `categories` を含めれば、将来の誤答生成に再利用可。
> * CIで `parts/index.json` のスキーマ検査（JSON Schema）を回しておくと事故が減る。

---

