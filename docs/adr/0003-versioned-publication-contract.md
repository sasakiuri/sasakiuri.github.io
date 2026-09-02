# ADR-0003: Versioned Publication Contract and Artifact Seal

- Status: Accepted
- Date: 2026-09-02

## Context

トップページと個人ページの外観は過去の状態を意図的に保つ一方、canonical、JSON-LD、Web App Manifest、Service
Worker、sitemap、robots、公開アセットには同じ URL と metadata が複数箇所に現れます。型検査とブラウザーテストだけでは、表示を変えずに起きる metadata の不整合や、ビルド後の file 差し替えを十分に説明できません。

従来の artifact
verifier は取得した成果物から manifest を毎回作り直していました。そのため成果物が妥当であることは検査できても、quality
job が最初に検査した byte と後続 job が受け取った byte の同一性は比較していませんでした。

## Decision

`config/site-contract.json` を version 付きの公開契約とし、draft 2020-12 JSON Schema の実行検証、アプリケーションの Zod
schema、build toolchain の strict validator の 3 つの境界で fail closed に検証します。契約には origin、trailing-slash
route、canonical、表示 metadata、SNS、画像、PWA scope、precache shell、discovery file を含めます。

静的 export 後に WHATWG 準拠 parser で HTML を解析し、重複 attribute、非引用 attribute、暗黙の文書構造を拒否します。JSON-LD、Web
App Manifest、sitemap、robots、Service Worker、画像 header を読み戻し、契約との相互整合と参照先を typed asset
graph として検査します。inline JavaScript は AST で解析し、期待する Service Worker 登録以外による `navigator`
capability の取得を拒否します。実ブラウザーでも登録回数、URL、scope、cache policy を照合します。Next.js の RSC
payload と chunk 内部は framework-owned opaque output とし、公開標準から到達できる境界だけを解析します。

検査に成功した file の ordinal path、byte 数、media type、SHA-1、SHA-256 から長さ付き tree
digest を生成します。さらに、file records、byte totals、route、PWA、discovery、typed asset
graph の全 evidence を canonical JSON にして seal digest へ含めます。quality job だけが `artifact:seal`
で seal を書き出し、後続 job は `artifact:verify` で既存 seal と比較します。seal は静的成果物と同じ Actions
artifact に保存し、形式検証済みの seal digest は job
output でも渡します。shell へ直接展開せず、引用した環境変数として verifier に渡します。verify は seal を上書きしません。

Service Worker の cache version も、ordinal URL と file byte を長さ付き field として SHA-256 へ入力します。Service
Worker 自身は自己参照を避けるため version 入力と precache 対象に含めません。

## Consequences

- 古い外観と既存 URL を変えずに、metadata と PWA の drift を build 時に検知できます。
- file の追加、削除、内容変更、seal 改変、異なる公開契約を別の失敗として報告できます。
- deploy job は package install なしで同一性を検証できます。
- SPDX 2.3 は全配信 file の SHA-1 と SHA-256、規定の package verification
  code を持ち、公式 validator を通過してから attestation に使います。検証直後の SBOM SHA-256 も job
  output で渡し、attestation の直前に byte 単位で再照合します。
- 公開契約の意図的な変更では schema、投影、成果物、visual baseline の各層を同時にレビューする必要があります。
- parser は生成 HTML を再シリアライズせず、browser と同じ構文で解釈する fail-closed reader として保守します。
