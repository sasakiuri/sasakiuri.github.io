# Threat Model

## 対象と前提

対象は、ソースから GitHub Actions、Actions artifact、GitHub Pages、利用者のブラウザーと Service Worker
cache までです。サイトは認証、入力フォーム、API、データベース、利用者追跡を持ちません。外部サイトへのリンクはありますが、第三者の script、style、font、画像は実行時に読み込みません。

保護する資産は、表示内容とデザインの完全性、訪問者に実行される JavaScript、デプロイ権限、依存関係と lockfile、脆弱性報告の機密性、復旧に使う provenance と SBOM です。

## Trust boundary

```mermaid
flowchart TD
  Contributor[Contributor workstation] --> GitHub[GitHub repository]
  Registry[npm registry] --> Actions[GitHub Actions]
  GitHub --> Actions
  Actions --> Artifact[Attested artifact]
  Artifact --> Pages[GitHub Pages]
  Pages --> Browser[Browser and Service Worker cache]
  Browser --> External[Explicit external links]
```

GitHub repository への merge、npm
registry からの取得、Actions の OIDC 署名、Pages への deploy、別 origin への利用者遷移が主要な trust boundary です。

## STRIDE 分析

| 脅威                   | 例                                                   | 主な対策                                                                 |
| ---------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------ |
| Spoofing               | 偽の配布元や証明書でサイトを装う                     | HTTPS 強制、TLS 合成監視、canonical URL、Sigstore ベースの attestation   |
| Tampering              | build 後に HTML、chunk、契約証跡を差し替える         | build-once promotion、tree／evidence seal、artifact digest、provenance   |
| Repudiation            | 誰が何を配信したか追跡できない                       | Git history、environment deployment、OIDC attestation、90 日の証跡保存   |
| Information disclosure | secret や source map を静的成果物へ混入する          | topology 契約、拡張子拒否、Gitleaks、secret pattern、公開前の検査        |
| Denial of service      | Pages 障害、巨大 asset、壊れた cache                 | 配信量予算、content hash cache、合成監視、再現可能な rollback            |
| Elevation of privilege | 悪意ある Action や install script が権限を取得する   | 最小権限、commit SHA pin、zizmor、allowBuilds、trust policy、CodeQL      |
| Cross-site scripting   | inline script または依存 chunk を注入する            | hash-based CSP、JSON-LD escaping、外部実行 resource 禁止、React escaping |
| Reverse tabnabbing     | 外部リンク先から元ページを操作する                   | `noopener noreferrer` を型付き `ExternalLink` で強制                     |
| Dependency confusion   | registry や transitive URL から別 package を取得する | pnpm lockfile、exact version、exotic subdependency 拒否、OSV、Dependabot |
| Stale offline content  | Service Worker が脆弱な旧成果物を保持する            | content hash cache、activate 時の旧 cache 削除、network-first navigation |

## Supply chain control

- Node.js、pnpm、直接依存は exact version で固定します。
- pnpm は release 後 24 時間未満の version、trust level が以前より低下した version、未承認 install
  script、transitive な git または tarball dependency を拒否します。
- GitHub Actions は mutable tag ではなく commit SHA で固定し、Dependabot で更新します。
- CodeQL、OSV、Dependency Review、Gitleaks、license allowlist、OpenSSF Scorecard を独立した検知層として使います。
- deploy 対象と attestation 対象は、browser と性能検査を通過した同一 artifact です。quality
  job が作った完全 evidence の seal digest と検証済み SBOM
  digest を別経路で渡し、後続 job は shell へ直接展開せず、seal を書き換えずに file 集合、byte、semantic
  evidence、attestation 対象 SBOM を照合します。

## 残余リスク

GitHub Pages では repository 単位の任意 HTTP response
header を設定できません。このため CSP は HTML の先頭に meta として入り、
`frame-ancestors`、HSTS、Permissions-Policy など header でのみ完全に適用できる制御は Pages 側に依存します。Next.js が出力する inline
style のため `style-src 'unsafe-inline'` も残ります。一方、script は `unsafe-inline` を許可せず、build ごとの SHA-256
hash だけを許可します。

GitHub、npm registry、ブラウザー vendor は外部 trust
anchor です。これらの全面的な侵害は repository 内の制御だけでは防げません。provenance、複数 scanner、合成監視は、侵害範囲の縮小と検知、復旧を目的とします。

外部リンク先の内容と可用性は保証できません。リンクは利用者の明示操作でだけ開き、遷移先に referrer と opener を渡しません。
