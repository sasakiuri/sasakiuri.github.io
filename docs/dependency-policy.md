# Dependency Policy

## 原則

依存追加には、標準 API や既存依存では解決できない明確な理由が必要です。本番 dependency は実際に browser または build 時の本番経路で必要なものだけにし、解析、test、文書化の tool は devDependency または互換性 workspace に隔離します。

すべての直接依存は exact version、pnpm lockfile は commit 対象です。Node.js と pnpm も `.node-version`、`.nvmrc`、
`packageManager`、Volta で固定します。

## 取得時の policy

`pnpm-workspace.yaml` は次を強制します。

- 公開後 1,440 分未満の version を strict mode で拒否する。
- 過去 1 年以内の package で、以前の release より npm provenance または署名の trust level が下がった場合に拒否する。
- registry が publish time を返せない場合に fail closed とする。
- transitive dependency の git、SSH、直接 tarball URL を拒否する。
- dependency install script は `allowBuilds` で個別承認し、未審査 script を拒否する。
- workspace cycle と peer dependency 不整合を拒否する。

互換性のための `packageExtensions` と脆弱性 override は、package、version、理由を限定します。全体的な peer
dependency 無視や全 install script 許可は禁止です。

## 更新と例外

Dependabot は npm、GitHub Actions、Dev
Container を週次更新します。更新 PR は通常の static、unit、browser、visual、performance、security
gate をすべて通す必要があります。

脆弱性例外には advisory ID、正確な dependency path、version、development-only かどうか、失効日を必要とします。例外は
`scripts/audit-dependencies.mjs` と Dependency Review の両方で同じ範囲に限定し、失効後は自動的に失敗させます。

license は本番 dependency の allowlist 方式です。新しい license または dual
license 表記を追加する場合は、利用条件を確認してから `scripts/check-licenses.mjs` の allowlist を更新します。

## 確認コマンド

```sh
pnpm install --frozen-lockfile
pnpm deps:check
pnpm deps:audit
pnpm license:check
```

`pnpm install` 自体が lockfile 全 entry に supply-chain policy を再適用します。信頼済みとして検査を省略する
`trustLockfile` は有効にしません。
