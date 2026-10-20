# 構成と設計

`/` は旧 SLITHY.NET の復元ページ、`/sasakiuri/` は個人ページ、`/sasakuri/diary/`
は X の公開投稿を保存した日記です。外観と既存 URL を保ったまま、Next.js で静的ファイルを生成して GitHub
Pages に配信します。

## ページの生成

Next.js App Router と React Server Components を使い、`output: "export"`
で静的ファイルを生成します。日記の検索とページ送りには Client
Component を使います。JavaScript が動かない場合も、最新50件と年別ページを読めます。

Service
Worker の登録コードはサイト設定から生成したインラインスクリプトです。画像はビルド時に寸法を検査し、元の WebP を配信します。画像変換用のサーバーは使いません。

```text
src/app/(slithy)/layout.tsx
  └─ page.tsx ── 旧 SLITHY.NET

src/app/(personal)/sasakiuri/layout.tsx
  ├─ StructuredData ── siteConfig
  ├─ ServiceWorkerRegistration ── public/sasakiuri/sw.js
  └─ page.tsx
       └─ HomePage
            ├─ siteConfig
            └─ ExternalLink

src/app/(diary)/sasakuri/diary/page.tsx
  └─ DiaryPage
       └─ DiaryExplorer ── 最新50件 → 全件検索

src/app/(diary)/sasakuri/diary/[year]/page.tsx
  └─ DiaryPage ── 年別ページ
       └─ src/content/diary.json

src/app/(diary)/sasakuri/diary/search-index.json/route.ts
  └─ id, publishedAt, text

src/app/(diary)/sasakuri/diary/feed.xml/route.ts
  └─ 最新50件 → 年別ページ内の記事リンク

scripts/browser/export-x-diary.js ── 表示中の DOM → JSON
scripts/import-diary-browser-export.mjs ── JSON → src/content/diary.json
scripts/update-diary.mjs ── FxEmbed → src/content/diary.json
```

ルートレイアウトを分け、英語の旧トップページと日本語の個人ページ・日記で、文書言語、メタデータ、CSS を設定しています。旧トップページの HTML と favicon は Wayback
Machine の保存内容を元に復元し、このリポジトリに置いています。ページの表示時に Wayback Machine へは接続しません。

## サイト設定

URL、表示文言、画像寸法、PWA のスコープ、公開ファイルは `config/site-contract.json` に記載します。`siteConfig`
は、そのうち個人ページで使う設定を読み込みます。`HomePage` は表示を担当し、`ExternalLink` は外部リンクの
`noopener noreferrer` を指定します。

設定は次の箇所で検証します。

- アプリケーション: Zod の strict schema
- CI: Ajv による JSON Schema draft 2020-12 との照合
- ビルド後: HTML と関連ファイルを読み戻して設定と照合
- デプロイ直前: Node.js の標準 API で保存済みハッシュと照合

正規 URL、サイトのオリジン、外部 HTTPS
URL、ディレクトリ、公開ファイル、ビルド成果物のパスは別の型として扱います。設定の不備、PWA のスコープ外にあるファイル、SNS の重複を検出した場合は処理を止めます。読み込んだ設定と子要素はすべて凍結し、実行中の書き換えを防ぎます。

## 日記の取得と保存

`Update diary`
が毎日00時23分（日本時間）に FxEmbed の公開 API を呼び出します。API キーや X の認証情報は使いません。投稿者の ID とアカウント名を固定値と照合し、X の投稿 ID から求めた日時と API の日時が一致することを確認します。他人の投稿、リポスト、引用元の本文は保存しません。

1ページ20件を要求し、すべて保存済みの本人投稿であるページか終端に達するまで、最大10ページを取得します。固定投稿が1件見つかっただけでは止めません。カーソルの循環、同じ ID に対する本文の不一致、ページ数の上限、通信失敗を検出した場合は保存を中止します。取得と検証がすべて成功した場合だけ、一時ファイルを
`rename` して日記を更新します。

過去投稿の初回取り込みには、ログイン済みブラウザーで表示された DOM から ID と本文を書き出します。取り込み時にアカウント、形式のバージョン、生成日時、投稿数、フィールドを検証します。外部の画像やスクリプトは取り込みません。

保存先は `src/content/diary.json`
です。投稿 ID の重複、URL、日時、新しい順の並びを、更新時とビルド時の両方で検証します。本文を HTML に出力するときは React がエスケープします。

## 日記の表示と検索

日記トップは最新50件を表示し、全投稿は年別の静的ページに分けます。トップから各年へリンクし、年別ページには月別目次、各記事への固定リンク、年ごとの正規 URL を設定します。本文へ移動するリンクとページ上部へ戻るリンクは、トップと年別ページの両方に置きます。

HTML と React Server Components のデータが1ファイルに集中しないよう、次のサイズ上限を設けています。

| 対象             | 上限            |
| ---------------- | --------------- |
| 個別ファイル     | 307,200 bytes   |
| HTML の合計      | 1,310,720 bytes |
| 静的ファイル全体 | 4,194,304 bytes |

ページの読み込み後に、同じサイトの `search-index.json`
を取得して全件検索に切り替えます。含めるのは投稿 ID、公開日時、本文だけです。ブラウザーでも件数、フィールド、形式、重複、時系列を検証します。取得や検証に失敗した場合は最新50件の表示を残し、再読み込みボタンで再取得できます。

検索では NFKC 正規化、複数語の AND 条件、完全一致、編集距離、部分列の一致を使います。数値を含む語は日付との誤一致を避けるため、完全一致だけにします。既定の並び順は関連順、検索語が空の場合は新しい順です。

入力中は関連する本文から3語以内の検索語候補を最大5件作り、検索欄の直後の `select`
に表示します。候補の前に見出しやリストの余白は置きません。マウス、上下キー、Enter、Escape で操作できます。選択した候補は検索欄に入り、一致した語は本文中の
`mark` で強調されます。

引用符による完全一致、先頭の `-` による除外、`OR`
で区切った条件にも対応します。これらの構文を入力中は候補を出しません。年と開始日・終了日で絞り込めます。並び順は関連順・新しい順・古い順、表示件数は10、25、50、100件を選べます。検索語、年、期間、並び順、件数、ページは History
API で URL に記録します。再読み込み、共有、戻る・進むで同じ条件を復元でき、条件はまとめて解除できます。

`feed.xml`
は最新50件の Atom フィードです。項目の識別子とリンクは年別ページ内の記事を指し、元投稿の URL は含めません。ページのメタデータと購読リンクから参照できます。`archive.txt`
は全件の日時と本文を出力します。検索インデックスは JSON での保存にも使います。

## メタデータとオフライン表示

Metadata API と1,200 × 630 px の PNG を使い、正規 URL、Open Graph、Twitter Card を出力します。JSON-LD の `ProfilePage`
と `Person` は検証済みの設定から作り、埋め込み前に `<` を Unicode エスケープに変換します。

`/sasakiuri/` の Web App Manifest には、192 px の通常アイコンと512 px の maskable アイコンを指定します。Service
Worker のスコープは `/sasakiuri/`
です。同じオリジンへの GET だけを扱い、ページの移動は network-first、画像・フォント・CSS・JavaScript は stale-while-revalidate で取得します。

ビルド後、公開ファイルの URL と内容から SHA-256 を求め、初回インストール時に保存するファイル一覧とキャッシュのバージョンを生成します。URL とファイル内容は長さ付きでハッシュ計算に渡します。これで、区切り位置の異なるデータを区別します。

各 HTML のインラインスクリプトから SHA-256 を求め、CSP の `meta` 要素に列挙します。スクリプトに `unsafe-inline`
は許可しません。CSP を挿入した後の HTML をキャッシュのハッシュ計算に使います。

ブラウザーの HTTP キャッシュを消した状態で、オフラインでも同じ HTML と表示になることをテストします。オフライン専用の画面は設けません。`/.well-known/security.txt`
には、非公開の脆弱性報告先と `SECURITY.md` を記載しています。

## TypeScript の使い分け

アプリケーションは TypeScript 7 を使います。dependency-cruiser、Madge、Stryker 用には、`tools/architecture` と
`tools/mutation` に TypeScript 5.9 のワークスペースを置いています。これらのツールが使う API と TypeScript
7 の互換性を分けて扱うためです。

動的に読み込む TypeScript の peer dependency は、pnpm の `packageExtensions` で指定します。

- Next.js、アプリケーション、テストの型検査には TypeScript 7 を使う。
- 依存グラフの解析と Mutation Testing にだけ TypeScript 5.9 を使う。
- peer dependency の例外は対象の依存に限り、全体の検査は無効にしない。

## 表示仕様

個人ページと日記は、ブラウザー標準の見出し、段落、リスト、リンク、ルビ、時刻表示を使います。要素間の余白、書体、文字サイズ、リンク色、フォーカス表示もブラウザーの標準スタイルに従います。追加する CSS は次の範囲です。

- 背景色: `#f0eee6`
- 本文色: `#141413`
- 本文幅: 欧文75chと和文37icのうち小さい方
- 左余白: 画面幅1440、1280、1024、768 pxで、それぞれ308、243、223、177 px。それ未満では0 px
- 内側余白: 画面幅768 px未満では左右8 px
- 名前の見出し: 本文の3倍、ルビはその半分、太字
- SNS リンクのタッチ領域: 高さ24 px以上
- 日記の検索欄: ブラウザーの既定幅を使い、表示領域の幅を上限にする

画像の表示寸法は300 × 264 pxです。CSS がなくても、画面幅320 pxで横にはみ出さない寸法です。記事には
`article`、内容のまとまりには `section`、区切りには `hr`、本文の改行には `br` を使います。各記事には見出しを付けます。

年別ページはリストとリンクで移動でき、現在の年に `aria-current="page"` を指定します。検索とページ送りには
`form`、`input`、`select`、`button`
を使います。期間入力の間には狭い画面で折り返せる位置を設け、読み込み状態と件数はライブリージョンで通知します。

個人ページの先頭は、名前、画像、ルビを含む `header` です。「文章」と「作ったもの」は別々の `section`、SNS のリンクは
`nav` に置き、各まとまりを `hr`
で区切ります。自己紹介や論述は公開する内容ができた段階で追加します。日記の絞り込み、並び順、候補、ページ送り、強調表示には専用の CSS を追加しません。

390 × 844 pxと1280 × 720 pxの Chromium スクリーンショットを比較し、意図しない差分があれば CI を失敗させます。320
px幅で横にあふれないことも確認します。旧トップページは1280 × 720
pxの復元元画像と比較し、見出し、引用文、日付、favicon、外部通信がないこともテストします。

## CI での検査

| 検査対象                 | ツールと基準                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| 書式と文章               | Prettier、Biome、Stylelint、Textlint、CSpell                                                              |
| モジュール間の依存と循環 | dependency-cruiser、Madge                                                                                 |
| 型                       | Next.js のルート型生成と TypeScript の strict 設定                                                        |
| 単体テスト               | Vitest、fast-check。`src/components` と `src/config` の対象コードはカバレッジ100%                         |
| コンポーネント           | Storybook の操作テストとブラウザーでの axe 検査                                                           |
| テストの検出力           | Stryker。HTTPS と外部リンクの Mutation Testing は95%以上                                                  |
| 未使用コードと依存       | Knip                                                                                                      |
| JavaScript のサイズ      | size-limit。Brotli 圧縮後200 kB以下                                                                       |
| 性能とアクセシビリティ   | Lighthouse を3回実行し、中央値を比較                                                                      |
| ブラウザーでの動作       | Playwright。Chromium、Firefox、WebKit で機能、オフライン動作、axe、画像差分を検査                         |
| 依存パッケージ           | ライセンス許可リスト、pnpm audit、Dependency Review、OSV、CodeQL、Gitleaks                                |
| GitHub Actions           | actionlint、zizmor。Action はコミット SHA で固定                                                          |
| 出力ファイル             | サイト設定、URL、メタデータ、JSON-LD、manifest、sitemap、robots、Service Worker、画像寸法、参照先との照合 |
| 配信前の変更             | 保存したファイル一覧・検査結果・ハッシュとの比較                                                          |
| ビルドの再現性           | ビルドを2回行い、全ファイルを比較                                                                         |
| 公開サイト               | HTTP 応答、ページ内容、オフライン用ファイル、TLS 証明書の定期検査                                         |

`quality` ジョブで一度だけ作った `out/`
と検証用ファイルを、後続のテストとデプロイで共用します。ファイルの追加・削除・内容変更と検査結果の変更をハッシュで確認し、検査したファイルをそのまま配信します。

CI では CycloneDX/SPDX SBOM、SLSA
provenance、ライセンス一覧、JUnit、各テストのレポート、ファイル一覧と検証用ハッシュを保存します。検査結果全体のハッシュは形式を確認し、成果物とジョブ出力の両方で後続処理へ渡します。依存パッケージ、GitHub
Actions、Dev Container は Dependabot が週次で更新します。

## 性能の上限と目標値

- 配信 JavaScript: Brotli 圧縮後200 kB以下
- Lighthouse Performance: 0.95以上
- Lighthouse Accessibility と SEO: 1.00
- Lighthouse Best Practices: 0.95以上
- LCP: 2,500 ms以下
- TBT: 200 ms以下
- CLS: 0.05以下

ブラウザーテストでは、外部通信やブラウザーエラーがないこと、未圧縮 JavaScript のサイズと Navigation
Timing が設定した上限内に収まることも検査します。
