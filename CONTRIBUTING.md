# Contributing

## セットアップ

Node.js 24 と、`package.json` の `packageManager` で固定された pnpm を使います。

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm validate
```

WebKit までローカルで確認する場合は、Playwright のブラウザーと OS 依存を導入してから全ブラウザーを検査します。

```sh
pnpm exec playwright install --with-deps chromium webkit
pnpm test:e2e:all
```

## 変更時のルール

1. 表示内容は `src/config/site.ts` に集約し、外部入力の境界は Zod で検証します。
2. 外部リンクには `ExternalLink` を使い、別タブ分離属性を維持します。
3. デザイン変更を意図しない修正では、Playwright の画像ベースラインを更新しません。
4. デザイン変更を意図する場合は、PC とモバイル双方の差分をレビューしてから `pnpm test:e2e:update` を実行します。
5. コミットメッセージは Conventional Commits に従います。
6. 依存を追加する前に、標準 API または既存依存で解決できないか確認し、`pnpm deps:check` と `pnpm license:check`
   を通します。

`pre-commit` では変更ファイルの Lint と整形、`commit-msg` ではメッセージ形式を自動検査します。通常の最終確認は
`pnpm validate`、テスト境界を変更した場合は `pnpm test:mutation` も実行してください。

コミットの scope は `ci`、`deps`、`docs`、`repo`、`site`、`tooling` のいずれかを使います。
