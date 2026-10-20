# 開発への参加

## セットアップ

Node.js 24 と、`package.json` の `packageManager` で固定された pnpm を使います。

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm validate
```

対応するすべてのブラウザーをローカルで確認する場合は、Playwright のブラウザーと実行に必要な OS のライブラリーをインストールします。

```sh
pnpm exec playwright install --with-deps chromium firefox webkit
pnpm test:e2e:all
```

## 変更時のルール

1. 公開ルート、表示内容、PWA、アセットは `config/site-contract.json` に集約し、`pnpm contract:validate` の JSON
   Schema と Zod の両方で検証します。
2. 外部リンクには `ExternalLink` を使い、`rel="noreferrer noopener"` を維持します。
3. デザイン変更を意図しない修正では、Playwright の画像ベースラインを更新しません。
4. デザイン変更を意図する場合は、PC とモバイル双方の差分をレビューしてから `pnpm test:e2e:update` を実行します。
5. コミットメッセージは Conventional Commits に従います。
6. 依存パッケージを追加する前に、標準 API または既存のパッケージで解決できないか確認し、`pnpm deps:check` と
   `pnpm license:check` を通します。
7. ビルドや配信処理を変更した場合は `pnpm build`
   でファイル一覧と検査結果のハッシュ（seal）を生成します。その後、`pnpm artifact:verify` と `pnpm test:reproducible`
   を実行し、ファイル構成と検証結果を含む seal を比較します。

`pre-commit` では変更ファイルの静的解析と整形、`commit-msg` ではメッセージ形式を自動検査します。変更後は
`pnpm validate`、テストの対象や判定条件を変更した場合は `pnpm test:mutation` も実行してください。

コミットのスコープは `ci`、`deps`、`docs`、`repo`、`site`、`tooling` のいずれかを使います。
