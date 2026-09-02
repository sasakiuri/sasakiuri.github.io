#!/usr/bin/env node

import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { connect } from "node:tls";

import { qualityGates } from "./lib/quality-gates.mjs";
import { containsXUrl } from "./lib/url-policy.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const reportDirectory = path.join(projectRoot, "reports", "monitoring");
const reportPath = path.join(reportDirectory, "synthetic.json");
const junitPath = path.join(reportDirectory, "synthetic-junit.xml");
const configuredUrl = process.env.SITE_URL ?? "https://slithy.net";
const siteUrl = new URL(configuredUrl);

if (
  siteUrl.protocol !== "https:" ||
  siteUrl.username !== "" ||
  siteUrl.password !== "" ||
  siteUrl.pathname !== "/" ||
  siteUrl.search !== "" ||
  siteUrl.hash !== ""
) {
  throw new TypeError("SITE_URL must be an HTTPS origin without credentials, a query, or a fragment.");
}

const checks = [
  endpointCheck("home page", "/", "text/html", (body) => {
    requireText(body, "<title>SLITHY.NET</title>");
    requireText(body, "WHAT IS SLITHY?");
    requireText(body, "/favicon.ico");
    requireStrongContentSecurityPolicy(body);
  }),
  endpointCheck("personal page", "/sasakiuri/", "text/html", (body) => {
    requireText(body, "<title>梶ヶ谷 宜之 | ホームページ</title>");
    requireText(body, "ea98a6f9-e9a6-43ea-a6e3-464656155004.webp");
    requireText(body, 'href="https://github.com/sasakiuri"');
    requireStrongContentSecurityPolicy(body);
  }),
  endpointCheck("diary", "/sasakuri/diary/", "text/html", (body) => {
    requireText(body, "<title>ささきうりの日記</title>");
    requireText(body, "ひさしぶりに弾作ろうとしたら");
    requireStrongContentSecurityPolicy(body);
  }),
  endpointCheck("diary search index", "/sasakuri/diary/search-index.json", "application/json", (body) => {
    validateDiarySearchIndex(JSON.parse(body));
  }),
  endpointCheck("diary text archive", "/sasakuri/diary/archive.txt", "text/plain", (body) => {
    requireText(body, "ささきうりの日記");
    requireText(body, "ひさしぶりに弾作ろうとしたら");
    if (containsXUrl(body)) {
      throw new TypeError("Diary text archive contains a source link.");
    }
  }),
  endpointCheck("diary Atom feed", "/sasakuri/diary/feed.xml", "xml", (body) => {
    requireText(body, '<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="ja">');
    const entries = body.match(/<entry>/gu)?.length ?? 0;
    const localEntry = body.match(/<id>(https:\/\/[^<]+\/sasakuri\/diary\/\d{4}\/#entry-\d+)<\/id>/u)?.[1];
    if (entries < 1 || entries > 50 || localEntry?.startsWith(`${siteUrl.origin}/`) !== true || containsXUrl(body)) {
      throw new TypeError("Diary Atom feed contains an invalid entry set or a source link.");
    }
  }),
  endpointCheck("web app manifest", "/sasakiuri/manifest.webmanifest", "application/manifest+json", (body) => {
    const manifest = JSON.parse(body);
    if (
      manifest.lang !== "ja" ||
      manifest.scope !== "/sasakiuri/" ||
      manifest.start_url !== "/sasakiuri/" ||
      manifest.theme_color !== "#f0eee6"
    ) {
      throw new TypeError("Web app manifest does not match the production contract.");
    }
  }),
  endpointCheck("robots policy", "/robots.txt", "text/plain", (body) => {
    requireText(body, `Sitemap: ${siteUrl.origin}/sitemap.xml`);
  }),
  endpointCheck("sitemap", "/sitemap.xml", "application/xml", (body) => {
    requireText(body, `<loc>${siteUrl.origin}/</loc>`);
    requireText(body, `<loc>${siteUrl.origin}/sasakiuri/</loc>`);
    requireText(body, `<loc>${siteUrl.origin}/sasakuri/diary/</loc>`);
  }),
  endpointCheck("service worker", "/sasakiuri/sw.js", "application/javascript", (body) => {
    requireText(body, 'const cachePrefix = "sasakiuri-"');
    if (body.includes("__PRECACHE_VERSION__") || body.includes("__PRECACHE_URLS__")) {
      throw new TypeError("Production Service Worker contains build placeholders.");
    }
  }),
  endpointCheck("security contact", "/.well-known/security.txt", "text/plain", (body) => {
    requireText(body, "Contact: https://github.com/sasakiuri/sasakiuri.github.io/security/advisories/new");
    const expires = body.match(/^Expires: (.+)$/mu)?.[1];
    if (expires === undefined || Date.parse(expires) <= Date.now()) {
      throw new TypeError("security.txt is missing a future expiry date.");
    }
  }),
  certificateCheck(),
];

const results = await Promise.all(
  checks.map(async ({ name, run }) => {
    const started = performance.now();
    try {
      const details = await run();
      return {
        details,
        durationMilliseconds: Math.round(performance.now() - started),
        name,
        status: "passed",
      };
    } catch (error) {
      return {
        details: error instanceof Error ? error.message : String(error),
        durationMilliseconds: Math.round(performance.now() - started),
        name,
        status: "failed",
      };
    }
  }),
);
const failures = results.filter(({ status }) => status === "failed");
const report = {
  checkedAt: new Date().toISOString(),
  results,
  site: siteUrl.origin,
  status: failures.length === 0 ? "passed" : "failed",
  version: 1,
};

await mkdir(reportDirectory, { recursive: true });
await Promise.all([
  writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`),
  writeFile(junitPath, createJunitReport(report)),
]);
await writeJobSummary(report);

if (failures.length > 0) {
  throw new AggregateError(
    failures.map(({ details, name }) => new Error(`${name}: ${details}`)),
    `${failures.length} production synthetic check(s) failed.`,
  );
}

process.stdout.write(`Production monitoring passed ${results.length} checks for ${siteUrl.origin}.\n`);

function endpointCheck(name, pathname, expectedContentType, validate) {
  return {
    name,
    async run() {
      const target = new URL(pathname, siteUrl);
      const { body, durationMilliseconds, response } = await fetchWithRetry(
        target,
        (candidateBody, candidateResponse) => {
          const candidateContentType = candidateResponse.headers.get("content-type") ?? "";
          if (!candidateContentType.includes(expectedContentType)) {
            throw new TypeError(
              `${target.pathname} returned unexpected Content-Type: ${candidateContentType || "missing"}`,
            );
          }
          validate(candidateBody);
        },
      );
      const contentType = response.headers.get("content-type") ?? "";
      return {
        bytes: Buffer.byteLength(body),
        contentType,
        responseMilliseconds: durationMilliseconds,
        status: response.status,
        url: target.href,
      };
    },
  };
}

function certificateCheck() {
  return {
    name: "TLS certificate",
    run: async () => {
      const certificate = await readCertificate(siteUrl.hostname, Number(siteUrl.port || 443));
      const validTo = Date.parse(certificate.validTo);
      if (!Number.isFinite(validTo)) {
        throw new TypeError(`TLS certificate has an invalid expiry date: ${certificate.validTo}`);
      }
      const remainingDays = Math.floor((validTo - Date.now()) / 86_400_000);
      if (remainingDays < qualityGates.syntheticMonitoring.certificateMinimumRemainingDays) {
        throw new TypeError(`TLS certificate expires in ${remainingDays} days (${certificate.validTo}).`);
      }
      return {
        authorized: true,
        issuer: certificate.issuer,
        protocol: certificate.protocol,
        remainingDays,
        validTo: certificate.validTo,
      };
    },
  };
}

async function fetchWithRetry(target, validate) {
  let lastError;
  for (let attempt = 1; attempt <= qualityGates.syntheticMonitoring.retries; attempt += 1) {
    const started = performance.now();
    try {
      const response = await fetch(target, {
        cache: "no-store",
        headers: { "User-Agent": "sasakiuri-production-monitor/1.0" },
        redirect: "error",
        signal: AbortSignal.timeout(qualityGates.syntheticMonitoring.requestTimeoutMilliseconds),
      });
      const body = await response.text();
      const durationMilliseconds = Math.round(performance.now() - started);
      if (!response.ok) {
        throw new TypeError(`${target.pathname} returned HTTP ${response.status}.`);
      }
      if (durationMilliseconds > qualityGates.syntheticMonitoring.maximumResponseMilliseconds) {
        throw new TypeError(
          `${target.pathname} took ${durationMilliseconds} ms; the budget is ${qualityGates.syntheticMonitoring.maximumResponseMilliseconds} ms.`,
        );
      }
      validate(body, response);
      return { body, durationMilliseconds, response };
    } catch (error) {
      lastError = error;
      if (attempt < qualityGates.syntheticMonitoring.retries) {
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
      }
    }
  }
  throw lastError;
}

function readCertificate(host, port) {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, minVersion: "TLSv1.2", port, rejectUnauthorized: true, servername: host });
    socket.setTimeout(qualityGates.syntheticMonitoring.requestTimeoutMilliseconds);
    socket.once("secureConnect", () => {
      const peer = socket.getPeerCertificate();
      const protocol = socket.getProtocol();
      socket.end();
      if (peer.valid_to === undefined || protocol === null) {
        reject(new TypeError("TLS peer did not provide certificate metadata."));
        return;
      }
      resolve({
        issuer: peer.issuer?.O ?? peer.issuer?.CN ?? "unknown",
        protocol,
        validTo: peer.valid_to,
      });
    });
    socket.once("timeout", () => socket.destroy(new Error("TLS certificate check timed out.")));
    socket.once("error", reject);
  });
}

function requireText(body, expected) {
  if (!body.includes(expected)) {
    throw new TypeError(`Response is missing expected production content: ${expected}`);
  }
}

function requireStrongContentSecurityPolicy(body) {
  requireText(body, 'http-equiv="Content-Security-Policy"');
  const scriptPolicy = body.match(/script-src ([^;]+)/u)?.[1] ?? "";
  if (!scriptPolicy.includes("'sha256-") || scriptPolicy.includes("'unsafe-inline'")) {
    throw new TypeError("Production Content Security Policy does not enforce inline script hashes.");
  }
}

function validateDiarySearchIndex(index) {
  if (
    typeof index !== "object" ||
    index === null ||
    Array.isArray(index) ||
    Object.keys(index).sort().join(",") !== "posts,version" ||
    index.version !== 1 ||
    !Array.isArray(index.posts) ||
    index.posts.length < 1 ||
    index.posts.length > 5_000
  ) {
    throw new TypeError("Diary search index does not match the production contract.");
  }

  let previousId;
  const ids = new Set();
  for (const post of index.posts) {
    if (
      typeof post !== "object" ||
      post === null ||
      Array.isArray(post) ||
      Object.keys(post).sort().join(",") !== "id,publishedAt,text" ||
      typeof post.id !== "string" ||
      !/^[1-9]\d{5,24}$/u.test(post.id) ||
      typeof post.publishedAt !== "string" ||
      new Date(post.publishedAt).toISOString() !== post.publishedAt ||
      typeof post.text !== "string" ||
      post.text.trim() !== post.text ||
      post.text === "" ||
      ids.has(post.id) ||
      (previousId !== undefined && BigInt(previousId) <= BigInt(post.id))
    ) {
      throw new TypeError("Diary search index contains an invalid post.");
    }
    ids.add(post.id);
    previousId = post.id;
  }
}

function createJunitReport(reportToSerialize) {
  const cases = reportToSerialize.results
    .map(({ details, durationMilliseconds, name, status }) => {
      const failure =
        status === "failed" ? `<failure message="${escapeXml(String(details))}" type="SyntheticCheckFailure"/>` : "";
      return `<testcase classname="production.synthetic" name="${escapeXml(name)}" time="${(
        durationMilliseconds / 1000
      ).toFixed(3)}">${failure}</testcase>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites tests="${reportToSerialize.results.length}" failures="${reportToSerialize.results.filter(({ status }) => status === "failed").length}"><testsuite name="production synthetic monitoring">${cases}</testsuite></testsuites>\n`;
}

function escapeXml(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function writeJobSummary(reportToSummarize) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath === undefined) {
    return;
  }
  const rows = reportToSummarize.results
    .map(
      ({ durationMilliseconds, name, status }) =>
        `| ${status === "passed" ? "✅" : "❌"} | ${name} | ${durationMilliseconds} ms |`,
    )
    .join("\n");
  await appendFile(
    summaryPath,
    `## Production synthetic monitoring\n\n| Status | Check | Duration |\n| --- | --- | ---: |\n${rows}\n`,
  );
}
