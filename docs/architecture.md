# Architecture

## 目的

元の 1 ページの表示をそのまま保ちつつ、フレームワーク更新、型安全性、回帰検知、継続的デプロイを独立して改善できる構成にすることが目的です。

## 実行モデル

- Next.js App Router の React Server Components を既定とします。
- output: export により、GitHub Pages に置ける静的ファイルだけを生成します。
- 現在のページにはクライアント状態がないため、use
  client と実行時 API は導入しません。
- 画像最適化サーバーを持たない配信先のため、画像はビルド時に寸法を検証しつつ unoptimized モードで元の WebP を配信します。

## 境界

```text
src/app
  └─ page.tsx
       └─ HomePage
            ├─ siteConfig
            └─ ExternalLink
```

siteConfig は文言、URL、画像寸法の唯一の定義元です。HomePage は表示だけを担当し、ExternalLink は外部遷移のセキュリティ属性を一元化します。

## デザイン不変条件

ビジュアル回帰テストの基準画像は、移行前の Next.js
12 版から取得しています。次の値は既存表示との互換性のため意図的に維持しています。

- コンテンツ領域: 最大 600 px、左右余白 32 px、中央寄せ
- 見出し: 24 px / 32 px、太字
- 画像: 384 × 337.438 px のレイアウト寸法
- ruby: 36 px / 40 px、太字、斜体、上下余白 8 px
- 本文色: rgb(0 0 0 / 87%)
- SNS リンク色: #1976d2

390 × 844 と 1280 ×
720 の Chromium スクリーンショットをピクセル単位で比較し、意図しない差分を CI で拒否します。

## 品質ゲート

1. Prettier、Biome、Stylelint
2. Next.js のルート型生成と TypeScript strict の追加安全性オプション
3. Vitest と 100% カバレッジ閾値
4. Knip による未使用ファイル・依存検知
5. Playwright による機能、静的成果物、axe、画像差分の検証
6. 検証済みの out/ だけを GitHub Pages にデプロイ

依存パッケージと GitHub Actions は Dependabot が週次で更新します。
