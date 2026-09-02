# sasakiuri.github.io

[![Verify and deploy](https://github.com/sasakiuri/sasakiuri.github.io/actions/workflows/pipeline.yml/badge.svg)](https://github.com/sasakiuri/sasakiuri.github.io/actions/workflows/pipeline.yml)
[![Security](https://github.com/sasakiuri/sasakiuri.github.io/actions/workflows/security.yml/badge.svg)](https://github.com/sasakiuri/sasakiuri.github.io/actions/workflows/security.yml)
[![OpenSSF Scorecard](https://github.com/sasakiuri/sasakiuri.github.io/actions/workflows/scorecard.yml/badge.svg)](https://github.com/sasakiuri/sasakiuri.github.io/actions/workflows/scorecard.yml)
[![Production monitoring](https://github.com/sasakiuri/sasakiuri.github.io/actions/workflows/monitoring.yml/badge.svg)](https://github.com/sasakiuri/sasakiuri.github.io/actions/workflows/monitoring.yml)

`slithy.net` の静的サイトです。外観は過去のページをそのまま保ち、内部だけを現行の型安全な静的配信基盤にしています。

- `/`: [2016 年 10 月 6 日の SLITHY.NET](https://web.archive.org/web/20161006024016/http://slithy.net/)
  を復元したトップページ
- `/sasakiuri/`: 梶ヶ谷宜之のホームページ

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

`http://localhost:3000/` と `http://localhost:3000/sasakiuri/` で確認できます。

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
| `pnpm validate`           | 1 回の build を全 consumer へ渡す Chromium 中心の検証       |

Chromium、Firefox、WebKit は CI で常時実行します。ローカルで `pnpm test:e2e:all` を使う場合は、事前に
`pnpm exec playwright install --with-deps chromium firefox webkit` を実行してください。

VS Code または GitHub Codespaces では `.devcontainer/devcontainer.json`
により、Node.js、拡張機能、port、初回 install を含む同じ開発環境を構築できます。

## 構成

- `src/app`: ルートごとの App Router、構造化メタデータ、OG 画像、sitemap、robots、manifest、Service Worker 登録
- `src/components`: 表示コンポーネントと Storybook Story
- `config/site-contract.json`: ルート、表示内容、PWA、公開アセットの version 付き契約
- `src/config`: 公開契約を Zod で再検証して深く凍結するアプリケーション境界
- `public`: SLITHY.NET の favicon、`/sasakiuri/` 用 PWA アイコンと Service Worker、RFC 9116 の security.txt
- `tests/e2e`: ブラウザー、アクセシビリティ、SEO、PWA、性能、ビジュアル回帰テスト
- `tools`: TypeScript 5.9 を必要とする解析ツールの隔離ワークスペース
- `scripts/lib`: strict HTML／契約検証、typed asset graph、Service Worker、tree／semantic evidence seal
- `.github/workflows`: build-once CI、セキュリティ、SBOM、attestation、合成監視、GitHub Pages 配信

設計上の判断と変更してはいけない表示仕様は [architecture.md](docs/architecture.md)、運用と SLO は
[operations.md](docs/operations.md)、脅威と残余リスクは [threat-model.md](docs/threat-model.md) にまとめています。
