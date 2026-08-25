# ADR-0001: Build Once and Promote

- Status: Accepted
- Date: 2026-08-25

## Context

browser、Lighthouse、deploy の各 job が個別に build すると、同じ commit でも異なる成果物を検査、配信する可能性があります。build 回数も増え、random
Build ID は provenance と再現性を弱めます。

## Decision

Next.js Build ID を静的配信用の固定値にし、`quality` job で一度だけ `out/`
を生成します。構造、配信量、CSP、全 file の SHA-256 を検査した後、hidden file を含む Actions artifact として保存します。

Chromium、Firefox、WebKit、Lighthouse は同じ artifact を download して検査します。deploy
job も同じ artifact を使い、決定的な tar.gz、SPDX SBOM、build provenance、SBOM
attestation を生成してから Pages に昇格します。

週次 job では、clean build を 2 回実行し、全 file path、size、SHA-256 が一致することを確認します。

## Consequences

- 検査した byte と配信した byte の対応を説明できます。
- browser matrix を並列化しても build は増えません。
- framework が非決定的な出力を導入した場合、週次再現性 gate が検知します。
- 後続 job は build artifact に依存するため、quality job の artifact retention と完全性検査が必須です。
