# Contributing

## セットアップ

Node.js 24 と、package.json の packageManager で固定された pnpm を使います。

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm validate
```

## 変更時のルール

1. 表示内容は src/config/site.ts に集約します。
2. 外部リンクには ExternalLink を使い、別タブ分離属性を維持します。
3. デザイン変更を意図しない修正では、Playwright の画像ベースラインを更新しません。
4. デザイン変更を意図する場合は、PC・モバイル双方の差分をレビューしてから pnpm
   test:e2e:update を実行します。
5. コミットメッセージは Conventional Commits に従います。

pre-commit では変更ファイルの Lint と整形、commit-msg ではメッセージ形式を自動検査します。最終確認は pnpm
validate で行ってください。
