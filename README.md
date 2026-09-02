# sasakiuri.github.io

[![Verify and deploy](https://github.com/sasakiuri/sasakiuri.github.io/actions/workflows/pipeline.yml/badge.svg)](https://github.com/sasakiuri/sasakiuri.github.io/actions/workflows/pipeline.yml)
[![Security](https://github.com/sasakiuri/sasakiuri.github.io/actions/workflows/security.yml/badge.svg)](https://github.com/sasakiuri/sasakiuri.github.io/actions/workflows/security.yml)
[![OpenSSF Scorecard](https://github.com/sasakiuri/sasakiuri.github.io/actions/workflows/scorecard.yml/badge.svg)](https://github.com/sasakiuri/sasakiuri.github.io/actions/workflows/scorecard.yml)
[![Production monitoring](https://github.com/sasakiuri/sasakiuri.github.io/actions/workflows/monitoring.yml/badge.svg)](https://github.com/sasakiuri/sasakiuri.github.io/actions/workflows/monitoring.yml)

`slithy.net` の静的サイトです。外観は過去のページをそのまま保ち、内部だけを現行の型安全な静的配信基盤にしています。

- `/`: [2016 年 10 月 6 日の SLITHY.NET](https://web.archive.org/web/20161006024016/http://slithy.net/)
  を復元したトップページ
- `/sasakiuri/`: 梶ヶ谷宜之のホームページ
- `/sasakuri/diary/`: 検索語候補、高度な検索、期間指定、ページ送り、購読・保存機能を備えた日記

トップページの favicon は、[2011 年 10 月 13 日のアーカイブ](https://web.archive.org/web/20111013212903/http://www.slithy.net/)
に保存されているオリジナルを使用します。実行時に外部リソースは読み込みません。

## 必要な環境

- Node.js 24.16.0（`.node-version` / `.nvmrc`）
- pnpm 11.23.0

```sh
corepack enable
pnpm install
pnpm dev
```

`http://localhost:3000/`、`http://localhost:3000/sasakiuri/`、`http://localhost:3000/sasakuri/diary/` で確認できます。

## 主なコマンド

| コマンド                  | 用途                                                        |
| ------------------------- | ----------------------------------------------------------- |
| `pnpm dev`                | Turbopack 開発サーバー                                      |
| `pnpm build`              | 静的 export、hash CSP、PWA precache、成果物 seal の生成     |
| `pnpm contract:validate`  | 公開契約の draft 2020-12 JSON Schema 実行検証               |
| `pnpm check`              | 書式、文章、契約、依存境界、型、単体テスト、ライセンス検査  |
| `pnpm test:storybook`     | Story の操作テストと実ブラウザーでのアクセシビリティ検査    |
| `pnpm test:e2e`           | Chromium の機能、axe、画像差分、PWA、配信量、SEO の検査     |
| `pnpm test:e2e:all`       | Chromium、Firefox、WebKit の全ブラウザー検査                |
| `pnpm test:lighthouse`    | 3 回の Lighthouse 計測と中央値の予算検査                    |
| `pnpm test:mutation`      | Stryker によるセキュリティ境界の Mutation Testing           |
| `pnpm storybook`          | コンポーネントカタログ                                      |
| `pnpm license:report`     | 本番依存ライセンスの許可判定と JSON 出力                    |
| `pnpm test:e2e:update`    | 意図した変更後の画像差分ベースライン更新                    |
| `pnpm artifact:seal`      | 公開契約、CSP、参照、配信量を検査して成果物を封印           |
| `pnpm artifact:verify`    | 既存 seal と現在の成果物 byte を比較（seal は上書きしない） |
| `pnpm test:reproducible`  | 2 回の clean build の全 SHA-256 を比較                      |
| `pnpm monitor:production` | 本番の HTTPS、内容、PWA、TLS 証明書を合成監視               |
| `pnpm diary:import`       | ブラウザーで収集した過去投稿を検証して日記へ統合            |
| `pnpm diary:update`       | X の公開プロフィールから日記データを取得して追記            |
| `pnpm validate`           | 1 回の build を全 consumer へ渡す Chromium 中心の検証       |

Chromium、Firefox、WebKit は CI で常時実行します。ローカルで `pnpm test:e2e:all` を使う場合は、事前に
`pnpm exec playwright install --with-deps chromium firefox webkit` を実行してください。

VS Code または GitHub Codespaces では `.devcontainer/devcontainer.json`
により、Node.js、拡張機能、port、初回 install を含む同じ開発環境を構築できます。

## 過去投稿を手動で取り込む

ログイン不要の公開 HTML には直近の数件しか含まれないため、過去投稿の初回取り込みには
[`scripts/browser/export-x-diary.js`](scripts/browser/export-x-diary.js) を使います。

1. Chrome または Edge で X にログインし、`https://x.com/sasakiuri/with_replies` を開きます。
2. DevTools の `Sources`、`Snippets`、`New snippet` の順に開き、`export-x-diary.js` の内容全体を貼り付けて実行します。
3. タブを開いたまま待ちます。スクリプトが自動で下へ移動し、完了すると `sasakiuri-posts-YYYY-MM-DD.json`
   をダウンロードします。

進捗は DevTools の Console で確認できます。途中までを保存する場合は `stop()`、ダウンロードがブロックされた場合は
`download()` を実行します。

```js
__sasakiuriDiaryExporter.status();
__sasakiuriDiaryExporter.stop();
__sasakiuriDiaryExporter.download();
```

書き出し件数は、画面の DOM に読み込めた本人の投稿数です。返信は含み、リポスト、削除済みまたは表示できない投稿は含みません。読み込みが途中で止まった場合は再度実行し、複数の JSON を一度に指定できます。重複は投稿 ID で統合します。

```sh
pnpm diary:import --dry-run /path/to/sasakiuri-posts-YYYY-MM-DD.json
pnpm diary:import /path/to/sasakiuri-posts-YYYY-MM-DD.json
pnpm diary:import /path/to/first.json /path/to/second.json
pnpm build
pnpm preview
```

取り込み後は `http://localhost:3000/sasakuri/diary/`、または `pnpm preview`
が表示する URL で確認します。日記トップでは全件をインクリメンタルに曖昧検索でき、入力中は本文から抽出した短い検索語候補を最大5件表示します。候補は上下キー、Enter、Escapeでも操作でき、完全に一致した検索語は本文内で強調されます。引用符による完全一致、`-検索語`
による除外、`OR`
条件にも対応します。年と期間、関連順・新しい順・古い順、1ページ当たり10、25、50、100件を選べ、条件は一度に解除できます。検索条件とページは URL に保存されるため、再読み込み、共有、ブラウザーの戻る・進むでも同じ表示を復元します。

年別ページには月別目次と各日記の固定リンクがあります。`/sasakuri/diary/feed.xml`
では最新50件を Atom で購読でき、全件をテキストまたは JSON でも保存できます。検索データの取得に失敗した場合は再読み込みでき、失敗中や JavaScriptを利用できない場合も最新50件と年別の静的ページを読めます。ページ内の本文と上部へ移動するリンクはキーボードでも利用できます。エクスポーターは表示中の投稿 ID と本文だけを JSON に保存します。Cookie、ストレージ、通信内容にはアクセスしません。HTML、HAR、X のアカウントアーカイブは取り込まないでください。

## 構成

- `src/app`: ルートごとの App Router、構造化メタデータ、OG 画像、sitemap、robots、manifest、Service Worker 登録
- `src/components`: 表示コンポーネントと Storybook Story
- `src/content/diary.json`: 自動取得した公開投稿の Git 管理アーカイブ
- `config/site-contract.json`: ルート、表示内容、PWA、公開アセットの version 付き契約
- `src/config`: 公開契約を Zod で再検証して深く凍結するアプリケーション境界
- `public`: SLITHY.NET の favicon、`/sasakiuri/` 用 PWA アイコンと Service Worker、RFC 9116 の security.txt
- `tests/e2e`: ブラウザー、アクセシビリティ、SEO、PWA、性能、ビジュアル回帰テスト
- `tools`: TypeScript 5.9 を必要とする解析ツールの隔離ワークスペース
- `scripts/lib`: strict HTML／契約検証、typed asset graph、Service Worker、tree／semantic evidence seal
- `.github/workflows`: 日記更新、build-once CI、セキュリティ、SBOM、attestation、合成監視、GitHub Pages 配信

`Update diary` は毎日00時23分（日本時間）に X のログイン不要な公開プロフィールを確認します。有料 API、API
key、X の認証情報は使いません。新しい投稿がある場合だけ `src/content/diary.json` をコミットし、検証済みの GitHub
Pages 配信を開始します。X の取得に失敗した場合は既存のアーカイブを変更しません。

設計上の判断と変更してはいけない表示仕様は [architecture.md](docs/architecture.md)、運用と SLO は
[operations.md](docs/operations.md)、脅威と残余リスクは [threat-model.md](docs/threat-model.md) にまとめています。
