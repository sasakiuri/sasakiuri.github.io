# Tooling Adoption

## 方針

2026 年 8 月 24 日時点の `../oss`、`../zhd-oms`、`../chiba-rifle`、`../kanagawa-rifle`、`../nilay`
を確認し、この静的な個人サイトに適用できる設定、ツール、ライブラリを取り込みました。デザイン、公開 URL、静的エクスポートを不変条件とし、機能を持たない依存は追加していません。

## 採用したもの

| 参照元         | 採用内容                                                 | このリポジトリでの配置                                                                            |
| -------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| oss            | CSpell、dependency-cruiser、size-limit、ライセンス検査   | `cspell.config.yaml`、`.dependency-cruiser.cjs`、`.size-limit.json`、`scripts/check-licenses.mjs` |
| oss            | CodeQL、OSV、Gitleaks、OpenSSF Scorecard、SBOM、来歴証明 | `.github/workflows/security.yml`、`.github/workflows/scorecard.yml`                               |
| oss            | CODEOWNERS、Issue、PR、セキュリティポリシー、PR title    | `.github`、`SECURITY.md`                                                                          |
| zhd-oms        | Storybook 10、Vitest Browser Mode、axe                   | `.storybook`、`vitest.storybook.config.ts`、各 `*.stories.tsx`                                    |
| zhd-oms        | Stryker、Lighthouse API、Madge、Textlint、JUnit          | `stryker.config.mjs`、`scripts`、`tools`、`.textlintrc.json`、Vitest 設定                         |
| chiba-rifle    | 日本語技術文書ルール、エディター共通設定                 | `.textlintrc.json`、`.editorconfig`、`.vscode`                                                    |
| kanagawa-rifle | Lighthouse とブラウザー回帰検査                          | `scripts/run-lighthouse.mjs`、`tests/e2e/home.quality.spec.ts`                                    |
| nilay          | Zod、CSpell、Madge、Git 属性とコミット規約               | `src/config`、`cspell.config.yaml`、`.gitattributes`、commitlint                                  |
| 全体           | Chromium と WebKit、依存監査、固定バージョン             | Playwright、pnpm workspace、Dependabot、commit SHA 固定 Actions                                   |

## 意図的に採用しなかったもの

次の項目は移植できますが、このサイトに対応する責務がないため採用していません。

- DB、Laravel、API client、React Query、form、認証、監視、Sentry、MQTT、Docker、Ansible
- 状態や variant を持つ UI 向けの Radix UI、CVA、`clsx`、`tailwind-merge`
- 複数の公開 package を前提とする Turborepo、syncpack、Changesets、release-please
- PDF 生成、負荷試験、バックエンド Mutation Testing、コンテナー脆弱性検査

また、Dependabot auto-merge、label 同期、stale、thread
lock、release 自動化は Issue や PR を外部から変更します。これらは repository
policy とラベル体系の合意が必要なため、読み取り中心の品質強化とは分けて採用していません。

Storybook が開発時だけ使う `image-size`
には、2026 年 8 月 24 日現在、公開済みの修正版がありません。該当する 2 件の advisory は依存名、バージョン、dev-only 経路を固定し、2026 年 9 月 30 日までの例外としています。条件、経路、期限のどれかが変わると
`pnpm deps:audit` は失敗します。OSV の例外も同じ日に失効します。

プロジェクト本体の `LICENSE`
は、著作権者が公開条件を選択する必要があります。他リポジトリのライセンスを機械的に流用せず、第三者依存のライセンス検査とレポート生成だけを導入しています。

## TypeScript 7 との互換性

Madge、dependency-cruiser、Stryker は現行版の一部で TypeScript 7 Compiler API を利用できません。peer
dependency 検査を無効化する代わりに、`tools/architecture` と `tools/mutation` だけを TypeScript
5.9 に隔離しました。アプリケーションと Next.js は引き続き TypeScript 7 で検査されます。
