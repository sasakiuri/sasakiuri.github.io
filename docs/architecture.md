# Architecture

## 目的

SLITHY.NET の旧トップページを復元し、既存の個人ページを `/sasakiuri/`
で保ちつつ、フレームワーク更新、型安全性、回帰検知、継続的デプロイを独立して改善できる構成にすることが目的です。さらに、Xの公開投稿を
`/sasakuri/diary/`
に保存します。既存ページの外観は意図的に古いまま固定し、内部の契約、検証、配信だけを更新することを設計原則とします。

## 実行モデル

- Next.js App Router の React Server Components を既定とします。
- output: export により、GitHub Pages に置ける静的ファイルだけを生成します。
- GitHub
  Actions が毎日00時23分（日本時間）に X の公開プロフィール HTML を取得します。本人の投稿を検証済み JSON へ追記し、変更時だけ配信します。
- 初回の過去投稿は、ログイン済みブラウザーで描画された DOM から投稿 ID と本文だけを JSON に書き出します。ローカルの取り込み処理が厳格に検証し、定期取得と同じ日記データへ統合します。
- 基本表示は React Server Components で生成します。日記トップだけは、全件検索とページ送りのための Client
  Component で段階的に拡張します。JavaScriptがない場合も、最新50件と年別アーカイブを読めます。
- Service Worker 登録は検証済み契約から生成する最小 inline script とします。
- 画像最適化サーバーを持たない配信先のため、画像はビルド時に寸法を検証しつつ unoptimized モードで元の WebP を配信します。

## 境界

```text
src/app/(slithy)/layout.tsx
  └─ page.tsx ── restored SLITHY.NET

src/app/(personal)/sasakiuri/layout.tsx
  ├─ StructuredData ── siteConfig
  ├─ ServiceWorkerRegistration ── public/sasakiuri/sw.js
  └─ page.tsx
       └─ HomePage
            ├─ siteConfig
            └─ ExternalLink

src/app/(diary)/sasakuri/diary/page.tsx
  └─ DiaryPage
       └─ DiaryExplorer ── latest 50 entries → full search index

src/app/(diary)/sasakuri/diary/[year]/page.tsx
  └─ DiaryPage ── yearly archive
       └─ src/content/diary.json

src/app/(diary)/sasakuri/diary/search-index.json/route.ts
  └─ id, publishedAt, text only

src/app/(diary)/sasakuri/diary/feed.xml/route.ts
  └─ latest 50 entries → canonical yearly archive fragments

scripts/browser/export-x-diary.js ── rendered DOM → sanitized JSON
scripts/import-diary-browser-export.mjs ── sanitized JSON → src/content/diary.json
```

複数の root
layout により、英語の旧トップページと日本語の個人ページで文書言語、メタデータ、CSS を分離します。旧トップページは指定された Wayback
Machine の HTML と favicon をローカルに復元し、実行時にはアーカイブへ接続しません。

`config/site-contract.json` はルート、文言、URL、画像寸法、PWA scope、公開アセットの唯一の契約です。`siteConfig`
はその個人ページ部分を型付きで投影します。HomePage は表示だけを担当し、ExternalLink は外部遷移のセキュリティ属性を一元化します。日記データは
`src/content/diary.json` に保存します。X の snowflake
ID から投稿時刻を決定的に復元し、ID 重複、URL、時刻、並び順を更新時と build 時の両方で検証します。ブラウザーの書き出しは固定アカウント、形式 version、生成日時、投稿数、未知のフィールドを取り込み前に検証します。公開 HTML は React が escape し、画像や script などの外部 resource は取り込みません。

日記トップは最新50件に制限し、全投稿を年別の静的ページへ重複なく分割します。トップからすべての年へリンクし、年ページには月別目次、各日記の固定 fragment、固有の canonical
URL を設定します。日記本文へのスキップリンクとページ上部へ戻るリンクはトップと年ページの両方に置きます。大量の本文が単一 HTML や React
Server Components のデータへ集中しないため、個別ファイル307,200
bytes の上限は維持します。コンテンツ増加を許容する集計上限は HTML 1,310,720 bytes、静的成果物全体4,194,304 bytes です。

日記トップの読み込み後は、同一オリジンの静的な `search-index.json`
を取得して全件検索へ切り替えます。このインデックスには投稿ID、公開日時、本文だけを含め、件数、フィールド、形式、重複、時系列をクライアントでも厳格に検証します。検索は NFKC正規化、複数語のAND条件、完全一致、編集距離、部分列を組み合わせ、数値を含む語は日付の誤一致を避けるため完全一致だけにします。検索結果は関連度順、空の検索は新しい順です。入力中は関連する本文を単語分割し、投稿そのものではなく3語以内の短い検索語候補を最大5件表示します。候補は見出しやリストの既定余白を挟まず、ブラウザー標準の開いた
`select`
として検索ボックスの直後へ置きます。マウスに加えて上下キー、Enter、Escapeで候補を操作できます。候補を選ぶと検索欄へ入力して再検索し、完全に一致した語はネイティブな
`mark` で本文内に示します。引用符で囲んだ完全一致、先頭の `-` による除外、`OR`
で区切ったいずれかの条件を解釈します。高度な構文の入力中は検索語候補を表示しません。年と開始日・終了日による絞り込み、関連順・新しい順・古い順、10、25、50、100件の表示件数を選択でき、すべての条件を一度に解除できます。検索語、年、期間、並び順、表示件数、ページは History
API で URL と同期し、再読み込み、共有、戻る・進むから復元します。検索インデックスの取得に失敗した場合は静的な最新50件を維持し、利用者の操作で再取得できます。

`feed.xml`
は最新50件の Atom フィードを静的生成します。各項目の識別子とリンクは年別アーカイブ内の記事 fragment であり、取得元の URL は公開しません。日記ページの metadata と本文の購読リンクから検出できます。`archive.txt`
は日時と本文だけの全件テキスト版を、検索インデックスは同じ最小フィールドの JSON 保存版を兼ねます。

アプリケーションは公開契約を Zod の strict schema で検証し、CI は Ajv で draft 2020-12 JSON
Schema と実 instance を照合します。seal 時は WHATWG 準拠 HTML parser を含む semantic validator、deploy 時は Node.js
built-in だけの promotion verifier と責務を分けます。canonical directory URL、origin、外部 HTTPS URL、directory
path、public asset path、artifact
path を別の型として扱います。設定オブジェクトとすべての子要素は parse 時に凍結し、型だけでは防げない設定ミス、scope 外アセット、重複 SNS、実行時の書き換えを拒否します。

個人ページと日記が共有する `globals.css`
は背景色、本文色、読みやすい行長、段階的な左余白、小画面の内側余白だけに限定し、Stylelint とビジュアル回帰テストで固定します。

## メタデータとオフライン

- Metadata API と 1,200 × 630 px の静的 PNG により、canonical、Open Graph、Twitter Card を生成します。
- JSON-LD は `ProfilePage` と `Person` を表し、strict なローカル設定だけから生成します。埋め込み前に `<` を Unicode
  escape へ変換します。
- `/sasakiuri/` の Web App Manifest は 192 px の通常アイコンと 512 px の maskable アイコンを公開します。
- Service Worker は `/sasakiuri/`
  の scope で同一オリジンの GET だけを扱います。ナビゲーションは network-first、画像、フォント、CSS、JavaScript は stale-while-revalidate です。
- ビルド後に公開契約と静的成果物から content hash 付きの precache
  manifest を生成し、既存の HTML、CSS、JavaScript、フォント、画像を初回インストール時に保存します。hash 入力は長さ付き field とし、URL と file
  byte の境界を曖昧にしません。
- ビルド後の inline script を SHA-256 で列挙し、script に `unsafe-inline` を許可しない CSP meta を全 application
  HTML に挿入します。CSP 挿入後の HTML を precache hash の入力にします。
- ブラウザーの HTTP
  cache を消した状態でも、オフライン時に同じ HTML とピクセル単位で同じデザインを返します。専用 UI は追加しません。
- `/.well-known/security.txt` は Private vulnerability reporting と `SECURITY.md` への機械可読な導線を提供します。

## ツールの互換性境界

アプリケーションは TypeScript 7 を使います。一方、dependency-cruiser、Madge、Stryker は TypeScript
7 の公開 API への対応が完了していないため、`tools/architecture` と `tools/mutation` に TypeScript
5.9 のワークスペースを設けています。

pnpm の `packageExtensions` で動的に読み込まれる TypeScript の peer 関係を明示し、次の不変条件を保ちます。

- Next.js、アプリケーション、テストの型検査は TypeScript 7 で実行する。
- 依存グラフと Mutation Testing のプロセスだけが TypeScript 5.9 を使う。
- peer dependency の不一致を全体で無効にせず、互換性例外を依存単位で固定する。

## デザイン不変条件

`/sasakiuri/` と `/sasakuri/diary/`
は、2000年代のブラウザーが CSS なしで表示する文書を基調にした共通デザインです。見出し、section、article、段落、リスト、リンク、ruby、時刻などの意味を HTML で表し、要素間の余白、書体、文字サイズ、リンク色、フォーカス表示にはブラウザーの User
Agent Stylesheet を使います。作者 CSS は、十分なコントラストと長文の可読性を保つ次の指定だけです。

- 背景色: #f0eee6
- 本文色: #141413
- 本文幅: 欧文75chと和文37icのうち小さい方
- 左余白: 1440、1280、1024、768 px の各画面幅で308、243、223、177 px、それ未満では0 px
- 内側余白: 768 px 未満では左右8 px
- ヒーローの名前: 本文の3倍、ルビはその半分、太字
- SNSリンクのタッチ領域: 高さ24 px以上

画像は CSS なしでも 320 px 幅で横スクロールを生じない 300 × 264 px の表示寸法にします。内容のまとまりと日記記事は
`section` と `article` で表し、まとまりの視覚的・意味的な区切りには `hr` を使います。日記本文の改行は HTML の `br`
で保持し、各記事を見出しで識別できる構造にします。年別アーカイブはネイティブなリストとリンクで移動でき、現在の年を
`aria-current="page"` で示します。検索とページ送りもネイティブな `form`、`input`、`select`、`button`
を使い、読み込み状態と件数はライブリージョンで通知します。個人トップでは見出し、画像、ルビを含む `header`
をヒーローとし、文章と作ったものを独立した `section`、外部SNSを `nav`
として表します。自己紹介や論述は内容を公開する段階で追加します。各まとまりは `hr`
で区切ります。日記の絞り込み、並び順、候補、ページ送り、検索語の強調には個別の作者 CSS を追加しません。

390 × 844 と 1280 × 720 の Chromium スクリーンショットをピクセル単位で比較し、意図しない差分を CI で拒否します。320
px 幅では横方向にあふれないことも確認します。ルートも 1280 ×
720 の復元元画像とピクセル単位で比較し、見出し、引用文、日付、favicon、外部通信がないことを別のブラウザーテストでも固定します。

## 品質ゲート

1. Prettier、Biome、Stylelint、Textlint、CSpell によるコードと文章の検査
2. dependency-cruiser と Madge によるレイヤー境界と循環依存の検査
3. Next.js のルート型生成と TypeScript strict の追加安全性オプション
4. Vitest、fast-check の property-based testing、100% カバレッジ閾値
5. Storybook の play 関数と実ブラウザー axe 検査
6. Stryker による HTTPS と外部リンク境界の 95% Mutation Testing 閾値
7. Knip による未使用ファイル、export、依存の検知
8. size-limit による Brotli 圧縮後 200 kB の JavaScript 予算
9. Lighthouse 3 回の中央値による性能、アクセシビリティ、Best Practices、SEO の予算
10. Playwright による Chromium と WebKit の機能、静的成果物、PWA オフライン動作、axe、画像差分の検証
11. 本番依存のライセンス許可リスト、pnpm audit、Dependency Review、OSV、CodeQL、Gitleaks
12. actionlint、zizmor、commit SHA 固定による GitHub Actions 自体の検査
13. JSON Schema の実 instance 検証と、静的成果物の canonical、metadata、JSON-LD、manifest、sitemap、robots、Service
    Worker、画像実寸、typed asset graph の契約検査
14. Chromium、Firefox、WebKit が同じ build artifact を検証する build-once promotion
15. 全 file の tree digest と全 semantic evidence の seal digest の昇格時照合、2 回の clean
    build 比較、本番 endpoint、PWA、TLS 証明書の合成監視

CI は CycloneDX/SPDX SBOM、SLSA
provenance、ライセンス一覧、JUnit、Lighthouse、Playwright、Storybook、Stryker、完全性 seal の成果物を保存します。一度だけ build した
`out/` と seal を同じ Actions artifact に格納します。完全な evidence を覆う seal digest は形式検証して job
output でも別経路で渡し、すべての gate とデプロイ直前で added、removed、changed
file を照合してから、検証済みの同一 byte だけを GitHub Pages にデプロイします。依存パッケージ、GitHub Actions、Dev
Container は Dependabot が週次で更新します。

## 性能予算

- 配信 JavaScript: Brotli 圧縮後 200 kB 以下
- Lighthouse Performance: 0.95 以上
- Lighthouse Accessibility と SEO: 1.00
- Lighthouse Best Practices: 0.95 以上
- LCP: 2,500 ms 以下
- TBT: 200 ms 以下
- CLS: 0.05 以下

ブラウザー E2E では、外部通信が発生しないこと、ブラウザーエラーがないこと、未圧縮 JavaScript と Navigation
Timing が決定的な上限内に収まることも検査します。
