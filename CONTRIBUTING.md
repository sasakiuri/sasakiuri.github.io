# Contributing

## セットアップ

Node.js 24 と、`package.json` の `packageManager` で固定された pnpm を使います。

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm validate
```

全 browser をローカルで確認する場合は、Playwright の browser と OS 依存を導入してから検査します。

```sh
pnpm exec playwright install --with-deps chromium firefox webkit
pnpm test:e2e:all
```

## 変更時のルール

1. 公開ルート、表示内容、PWA、アセットは `config/site-contract.json` に集約し、`pnpm contract:validate` の JSON
   Schema と Zod の両方で検証します。
2. 外部リンクには `ExternalLink` を使い、別タブ分離属性を維持します。
3. デザイン変更を意図しない修正では、Playwright の画像ベースラインを更新しません。
4. デザイン変更を意図する場合は、PC とモバイル双方の差分をレビューしてから `pnpm test:e2e:update` を実行します。
5. コミットメッセージは Conventional Commits に従います。
6. 依存を追加する前に、標準 API または既存依存で解決できないか確認し、`pnpm deps:check` と `pnpm license:check`
   を通します。
7. build や配信処理を変更した場合は `pnpm build` で新しい seal を生成してから `pnpm artifact:verify` と
   `pnpm test:reproducible` を実行し、file tree と semantic evidence の完全性 seal を比較します。

`pre-commit` では変更ファイルの Lint と整形、`commit-msg` ではメッセージ形式を自動検査します。通常の最終確認は
`pnpm validate`、テスト境界を変更した場合は `pnpm test:mutation` も実行してください。

コミットの scope は `ci`、`deps`、`docs`、`repo`、`site`、`tooling` のいずれかを使います。
