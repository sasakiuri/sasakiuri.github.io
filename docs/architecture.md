# Architecture

## 目的

元の 1 ページの表示をそのまま保ちつつ、フレームワーク更新、型安全性、回帰検知、継続的デプロイを独立して改善できる構成にすることが目的です。

## 実行モデル

- Next.js App Router の React Server Components を既定とします。
- output: export により、GitHub Pages に置ける静的ファイルだけを生成します。
- 表示は React Server Components だけで生成します。唯一の Client Component は何も描画せず、production で Service
  Worker を登録する境界です。
- 画像最適化サーバーを持たない配信先のため、画像はビルド時に寸法を検証しつつ unoptimized モードで元の WebP を配信します。

## 境界

```text
src/app/layout.tsx
  ├─ StructuredData ── siteConfig
  ├─ ServiceWorkerRegistration ── public/sw.js
  └─ page.tsx
       └─ HomePage
            ├─ siteConfig
            └─ ExternalLink
```

siteConfig は文言、URL、画像寸法の唯一の定義元です。HomePage は表示だけを担当し、ExternalLink は外部遷移のセキュリティ属性を一元化します。

`siteConfig` はビルド時に Zod の strict schema で検証します。HTTPS
URL の schema は独立した境界として扱い、検証後に template literal
type へ変換します。設定オブジェクトとすべての子要素は parse 時に凍結し、型だけでは防げない設定ミスと実行時の書き換えを拒否します。

CSS Modules には隣接する型宣言を置き、`noPropertyAccessFromIndexSignature` を無効化せずにクラス名の誤記を型検査します。

## メタデータとオフライン

- Metadata API と 1,200 × 630 px の静的 PNG により、canonical、Open Graph、Twitter Card を生成します。
- JSON-LD は `ProfilePage` と `Person` を表し、strict なローカル設定だけから生成します。埋め込み前に `<` を Unicode
  escape へ変換します。
- Web App Manifest は 192 px の通常アイコンと 512 px の maskable アイコンを公開します。
- Service
  Worker は同一オリジンの GET だけを扱います。ナビゲーションは network-first、画像、フォント、CSS、JavaScript は stale-while-revalidate です。
- ビルド後に静的成果物から content hash 付きの precache
  manifest を生成し、既存の HTML、CSS、JavaScript、フォント、画像を初回インストール時に保存します。
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

ビジュアル回帰テストの基準画像は、移行前の Next.js
12 版から取得しています。PWA とメタデータを含む基盤更新後も基準画像は更新しません。次の値は既存表示との互換性のため意図的に維持しています。

- コンテンツ領域: 最大 600 px、左右余白 32 px、中央寄せ
- 見出し: 24 px / 32 px、太字
- 画像: 384 × 337.438 px のレイアウト寸法
- ruby: 36 px / 40 px、太字、斜体、上下余白 8 px
- 本文色: rgb(0 0 0 / 87%)
- SNS リンク色: #1976d2

390 × 844 と 1280 × 720 の Chromium スクリーンショットをピクセル単位で比較し、意図しない差分を CI で拒否します。

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

CI は CycloneDX SBOM、ライセンス一覧、JUnit、Lighthouse、Playwright、Storybook、Stryker の成果物を保存します。検証済みの
`out/` だけを GitHub Pages にデプロイします。依存パッケージと GitHub Actions は Dependabot が週次で更新します。

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
