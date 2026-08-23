# sasakiuri.github.io

[![Verify and deploy](https://github.com/sasakiuri/sasakiuri.github.io/actions/workflows/pipeline.yml/badge.svg)](https://github.com/sasakiuri/sasakiuri.github.io/actions/workflows/pipeline.yml)

梶ヶ谷宜之のホームページです。表示デザインを維持したまま、Next.js の App
Router と静的エクスポートを使う構成にしています。

## 必要な環境

- Node.js 24.16.0（.node-version / .nvmrc）
- pnpm 11.22.0

```sh
corepack enable
pnpm install
pnpm dev
```

http://localhost:3000 で確認できます。

## 主なコマンド

| コマンド             | 用途                                           |
| -------------------- | ---------------------------------------------- |
| pnpm dev             | Turbopack 開発サーバー                         |
| pnpm build           | out/ への静的エクスポート                      |
| pnpm check           | 書式・Lint・型・単体テスト・未使用コードの検査 |
| pnpm test:e2e        | ビルド、E2E、axe、画像差分テスト               |
| pnpm test:e2e:update | 意図した変更後の画像差分ベースライン更新       |
| pnpm validate        | ローカルで CI 相当の全検証                     |

## 構成

- src/app: App Router、メタデータ、sitemap、robots、manifest
- src/components: 表示コンポーネント
- src/config/site.ts: 表示内容と外部 URL の唯一の定義元
- tests/e2e: ブラウザー、アクセシビリティ、ビジュアル回帰テスト
- .github/workflows/pipeline.yml: 品質検証から GitHub
  Pages 配信までのパイプライン

設計上の判断と、変更してはいけない表示仕様は
[docs/architecture.md](docs/architecture.md) にまとめています。
