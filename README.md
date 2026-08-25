# sasakiuri.github.io

[![Verify and deploy](https://github.com/sasakiuri/sasakiuri.github.io/actions/workflows/pipeline.yml/badge.svg)](https://github.com/sasakiuri/sasakiuri.github.io/actions/workflows/pipeline.yml)
[![Security](https://github.com/sasakiuri/sasakiuri.github.io/actions/workflows/security.yml/badge.svg)](https://github.com/sasakiuri/sasakiuri.github.io/actions/workflows/security.yml)
[![OpenSSF Scorecard](https://github.com/sasakiuri/sasakiuri.github.io/actions/workflows/scorecard.yml/badge.svg)](https://github.com/sasakiuri/sasakiuri.github.io/actions/workflows/scorecard.yml)

梶ヶ谷宜之のホームページです。

## 必要な環境

- Node.js 24.16.0（`.node-version` / `.nvmrc`）
- pnpm 11.23.0

```sh
corepack enable
pnpm install
pnpm dev
```

`http://localhost:3000` で確認できます。

## 主なコマンド

| コマンド               | 用途                                                            |
| ---------------------- | --------------------------------------------------------------- |
| `pnpm dev`             | Turbopack 開発サーバー                                          |
| `pnpm build`           | 静的エクスポートと content hash 付き PWA precache の生成        |
| `pnpm check`           | 書式、文章、依存境界、型、単体テスト、ライセンスの検査          |
| `pnpm test:storybook`  | Story の操作テストと実ブラウザーでのアクセシビリティ検査        |
| `pnpm test:e2e`        | Chromium の機能、axe、画像差分、PWA、配信量、SEO の検査         |
| `pnpm test:e2e:all`    | Chromium と WebKit の全ブラウザー検査                           |
| `pnpm test:lighthouse` | 3 回の Lighthouse 計測と中央値の予算検査                        |
| `pnpm test:mutation`   | Stryker によるセキュリティ境界の Mutation Testing               |
| `pnpm storybook`       | コンポーネントカタログ                                          |
| `pnpm license:report`  | 本番依存ライセンスの許可判定と JSON 出力                        |
| `pnpm test:e2e:update` | 意図した変更後の画像差分ベースライン更新                        |
| `pnpm validate`        | WebKit と Mutation Testing を除く、ローカルで自己完結する全検証 |

WebKit は CI で常時実行します。ローカルで `pnpm test:e2e:all` を使う場合は、事前に
`pnpm exec playwright install --with-deps chromium webkit` を実行してください。

## 構成

- `src/app`: App Router、構造化メタデータ、OG 画像、sitemap、robots、manifest、Service Worker 登録
- `src/components`: 表示コンポーネントと Storybook Story
- `src/config`: Zod で検証して深く凍結する表示内容と URL 境界
- `public`: PWA アイコン、Service Worker、RFC 9116 の security.txt
- `tests/e2e`: ブラウザー、アクセシビリティ、SEO、PWA、性能、ビジュアル回帰テスト
- `tools`: TypeScript 5.9 を必要とする解析ツールの隔離ワークスペース
- `.github/workflows`: 品質、セキュリティ、SBOM、Mutation Testing、GitHub Pages 配信

設計上の判断と変更してはいけない表示仕様は [architecture.md](docs/architecture.md) にまとめています。
