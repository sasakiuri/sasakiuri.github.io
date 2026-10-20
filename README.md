# sasakiuri.github.io

[![Verify and deploy](https://github.com/sasakiuri/sasakiuri.github.io/actions/workflows/pipeline.yml/badge.svg)](https://github.com/sasakiuri/sasakiuri.github.io/actions/workflows/pipeline.yml)
[![Security](https://github.com/sasakiuri/sasakiuri.github.io/actions/workflows/security.yml/badge.svg)](https://github.com/sasakiuri/sasakiuri.github.io/actions/workflows/security.yml)
[![OpenSSF Scorecard](https://github.com/sasakiuri/sasakiuri.github.io/actions/workflows/scorecard.yml/badge.svg)](https://github.com/sasakiuri/sasakiuri.github.io/actions/workflows/scorecard.yml)
[![Production monitoring](https://github.com/sasakiuri/sasakiuri.github.io/actions/workflows/monitoring.yml/badge.svg)](https://github.com/sasakiuri/sasakiuri.github.io/actions/workflows/monitoring.yml)

`slithy.net` のソースです。Next.js で静的ファイルを生成し、GitHub Pages で公開しています。

- `/`: [2016 年 10 月 6 日の SLITHY.NET](https://web.archive.org/web/20161006024016/http://slithy.net/)
  を復元したトップページ
- `/sasakiuri/`: 梶ヶ谷宜之のホームページ
- `/sasakuri/diary/`: X の公開投稿を保存した日記

トップページの favicon は、[2011 年 10 月 13 日のアーカイブ](https://web.archive.org/web/20111013212903/http://www.slithy.net/)
に保存されていたものです。ページの表示時に外部の画像やスクリプトは読み込みません。

## ローカルで起動する

Node.js 24.16.0 と pnpm 11.23.0 を使います。Node.js のバージョンは `.node-version` と `.nvmrc` にも記載しています。

```sh
corepack enable
pnpm install
pnpm dev
```

`http://localhost:3000/`、`http://localhost:3000/sasakiuri/`、`http://localhost:3000/sasakuri/diary/`
で各ページを確認できます。

VS Code と GitHub Codespaces 用の設定は `.devcontainer/devcontainer.json`
にあります。Node.js、拡張機能、ポート、初回の依存インストールを設定しています。

## コマンド

| コマンド                  | 用途                                                             |
| ------------------------- | ---------------------------------------------------------------- |
| `pnpm dev`                | 開発サーバーの起動                                               |
| `pnpm build`              | 静的ファイル、CSP、オフライン用キャッシュ、検証用ハッシュの生成  |
| `pnpm contract:validate`  | サイト設定を JSON Schema draft 2020-12 で検証                    |
| `pnpm check`              | 書式、文章、依存関係、型、単体テスト、ライセンスの検査           |
| `pnpm test:storybook`     | コンポーネントの操作とアクセシビリティの検査                     |
| `pnpm test:e2e`           | Chromium で機能、画像差分、オフライン動作、配信量、SEO を検査    |
| `pnpm test:e2e:all`       | Chromium、Firefox、WebKit での検査                               |
| `pnpm test:lighthouse`    | ビルド後に Lighthouse を3回実行し、中央値を確認                  |
| `pnpm test:mutation`      | Stryker で HTTPS と外部リンクのテストを検査                      |
| `pnpm storybook`          | Storybook の起動                                                 |
| `pnpm license:report`     | 本番依存のライセンスを検査し、JSON に出力                        |
| `pnpm test:e2e:update`    | 意図した表示変更の画像を比較基準として保存                       |
| `pnpm artifact:seal`      | 成果物を検査し、ファイル一覧と検査結果のハッシュを保存           |
| `pnpm artifact:verify`    | 保存したハッシュと現在の成果物を比較                             |
| `pnpm test:reproducible`  | ビルドを2回行い、全ファイルの SHA-256 を比較                     |
| `pnpm monitor:production` | 公開サイトの HTTPS、内容、オフライン用ファイル、TLS 証明書を検査 |
| `pnpm diary:import`       | ブラウザーで書き出した投稿を日記に追加                           |
| `pnpm diary:update`       | FxEmbed から X の公開投稿を取得して日記を更新                    |
| `pnpm validate`           | コード検査、ビルド、Chromium、性能、依存監査の一括実行           |

CI では Chromium、Firefox、WebKit を使います。ローカルで `pnpm test:e2e:all`
を実行する場合は、先にブラウザーをインストールしてください。

```sh
pnpm exec playwright install --with-deps chromium firefox webkit
```

## 日記の自動更新

`Update diary`
が毎日00時23分（日本時間）に、[FxEmbed の公開 API](https://docs.fxembed.com/api/twitter/operations/2profilehandlestatuses/)
から X の投稿を取得します。無料で利用でき、API キーや X の認証情報は使いません。FxEmbed は X とは別の運営者のサービスです。

投稿者の ID、アカウント名、投稿日時を確認し、保存済みの投稿が続くページまで取得します。変更があれば
`src/content/diary.json` をコミットし、テストとビルドを実行して GitHub
Pages に配信します。取得や検証に失敗した場合は、保存済みのデータを変更しません。

```sh
pnpm diary:update --dry-run
```

このコマンドでは、ファイルを変更せずに追加件数と本文の更新件数を確認できます。

## 過去投稿を手動で取り込む

ログインせずに取得できる公開 HTML には、直近の数件しか含まれません。過去の投稿は、ログイン済みのブラウザーで
[`scripts/browser/export-x-diary.js`](scripts/browser/export-x-diary.js) を実行して書き出します。

1. Chrome または Edge で X にログインし、`https://x.com/sasakiuri/with_replies` を開きます。
2. DevTools の `Sources` → `Snippets` → `New snippet` を開き、スクリプト全体を貼り付けて実行します。
3. タブを開いたまま待ちます。自動で下へスクロールし、完了すると `sasakiuri-posts-YYYY-MM-DD.json` をダウンロードします。

進捗は Console で確認できます。途中までを保存する場合は `stop()`、ダウンロードがブロックされた場合は `download()`
を実行します。

```js
__sasakiuriDiaryExporter.status();
__sasakiuriDiaryExporter.stop();
__sasakiuriDiaryExporter.download();
```

保存されるのは、画面に読み込まれた本人の投稿です。返信は含みますが、リポストや削除済み・表示できない投稿は含みません。読み込みが止まった場合は再実行し、複数の JSON をまとめて取り込めます。投稿 ID が同じものは重複して保存しません。

```sh
pnpm diary:import --dry-run /path/to/sasakiuri-posts-YYYY-MM-DD.json
pnpm diary:import /path/to/sasakiuri-posts-YYYY-MM-DD.json
pnpm diary:import /path/to/first.json /path/to/second.json
pnpm build
pnpm preview
```

取り込み後は、開発サーバーの日記ページか `pnpm preview` が表示する URL で確認します。

書き出しスクリプトが読むのは、表示中の投稿 ID と本文だけです。Cookie、ストレージ、通信内容にはアクセスしません。取り込めるのはこのスクリプトが出力した JSON です。HTML、HAR、X のアカウントアーカイブは使えません。

## 日記の検索と保存

検索欄に入力すると、保存した全投稿から検索します。入力中は本文から短い検索語候補を最大5件表示します。候補は上下キー、Enter、Escape でも操作できます。一致した語は本文中で強調します。

- `"検索語"`: 完全一致
- `-検索語`: その語を含む投稿を除外
- `検索語 OR 検索語`: どちらかを含む投稿

年と期間で絞り込み、関連順・新しい順・古い順に並べ替えられます。1ページの表示件数は10、25、50、100件です。検索条件とページは URL に保存され、再読み込み、共有、ブラウザーの戻る・進むでも引き継がれます。条件はまとめて解除できます。

年別ページには月別目次と各記事への固定リンクがあります。検索データの取得に失敗した場合は再読み込みできます。JavaScript が動かない場合も、最新50件と年別ページは読めます。本文とページ上部へのリンクはキーボードでも操作できます。

`/sasakuri/diary/feed.xml`
では最新50件を Atom で購読できます。全件をテキストまたは JSON で保存するリンクも日記ページにあります。

## ファイルの配置

- `src/app`: ページ、メタデータ、OG 画像、サイトマップ、robots、manifest
- `src/components`: 表示コンポーネントと Storybook
- `src/content/diary.json`: Git で保存する日記データ
- `config/site-contract.json`: URL、表示内容、画像、PWA の設定
- `src/config`: 設定を検証して読み込む処理
- `public`: favicon、PWA アイコン、Service Worker、`security.txt`
- `tests/e2e`: ブラウザーでの操作、表示、オフライン動作、性能のテスト
- `tools`: TypeScript 5.9 を使う解析ツール用のワークスペース
- `scripts/lib`: HTML、設定、参照ファイル、キャッシュ、ハッシュの検査処理
- `.github/workflows`: 日記更新、テスト、ビルド、セキュリティ検査、GitHub Pages への配信

設計と表示仕様は [architecture.md](docs/architecture.md)、運用手順は
[operations.md](docs/operations.md)、セキュリティ上の対策と制約は [threat-model.md](docs/threat-model.md)
を参照してください。
