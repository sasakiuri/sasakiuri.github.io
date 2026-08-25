# ADR-0002: Hash-based CSP for Static Export

- Status: Accepted
- Date: 2026-08-25

## Context

GitHub Pages の静的 export では request ごとの nonce を生成できず、repository から任意の CSP response
header も設定できません。Next.js は React Server Component payload を inline script として出力するため、単純な
`script-src 'self'` では起動しません。

## Decision

Next.js build 後にすべての application HTML を走査し、各 inline
script の SHA-256 を計算します。HTML の charset 直後へ CSP meta を挿入し、`script-src` は same-origin
chunk と計算済み hash だけを許可します。`unsafe-inline` と `unsafe-eval` は script に許可しません。

Service Worker manifest は CSP 挿入後に生成し、最終 HTML の content hash を cache version に反映します。artifact
verifier はすべての inline
script が policy に含まれること、実行 resource が same-origin で存在することを確認します。Playwright は実際の browser で CSP
violation と console error がないことを確認します。

## Consequences

- 静的配信と CDN cache を維持したまま、任意 inline script の実行を拒否できます。
- Next.js の HTML 出力形式が変わると build は fail closed になります。
- meta CSP で利用できない `frame-ancestors` などは残余リスクです。
- Next.js の inline style を維持するため、style に限って `unsafe-inline` が残ります。
- executable resource は artifact verifier が same-origin に限定し、HTTPS は配信基盤と合成監視で保証します。loopback
  HTTP で同一 artifact を検証できるよう、`upgrade-insecure-requests` は meta policy に含めません。
