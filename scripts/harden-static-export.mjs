#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { collectFiles, digest, readUtf8, toPosixPath } from "./lib/static-export.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const outputDirectory = path.join(projectRoot, "out");
const reportDirectory = path.join(projectRoot, "reports", "security");
const inlineScriptPattern = /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/giu;

const htmlFiles = (await collectFiles(outputDirectory)).filter((filePath) => filePath.endsWith(".html"));
const pages = [];

for (const filePath of htmlFiles) {
  const html = await readUtf8(filePath);

  // Provider verification files are deliberately plain HTML and do not execute application resources.
  if (!html.includes("/_next/")) {
    continue;
  }

  if (/http-equiv=["']Content-Security-Policy["']/iu.test(html)) {
    throw new TypeError(`Content Security Policy already exists: ${filePath}`);
  }

  const hashes = [
    ...new Set(
      [...html.matchAll(inlineScriptPattern)].map(
        ([, source = ""]) => `'sha256-${digest(Buffer.from(source), "base64")}'`,
      ),
    ),
  ];

  if (hashes.length === 0) {
    throw new TypeError(`Expected framework inline scripts in ${filePath}`);
  }

  const policy = [
    "default-src 'none'",
    "base-uri 'none'",
    "connect-src 'self'",
    "font-src 'self'",
    "form-action 'none'",
    "frame-src 'none'",
    "img-src 'self'",
    "manifest-src 'self'",
    "media-src 'none'",
    "object-src 'none'",
    `script-src 'self' ${hashes.join(" ")}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self'",
  ].join("; ");
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}"/>`;
  const hardened = html.replace(/(<meta\s+charSet=["'][^"']+["']\s*\/>)/iu, `$1${meta}`);

  if (hardened === html) {
    throw new TypeError(`Unable to insert Content Security Policy after the charset in ${filePath}`);
  }

  await writeFile(filePath, hardened);
  pages.push({
    inlineScriptHashes: hashes.map((hash) => hash.slice(1, -1)),
    path: toPosixPath(outputDirectory, filePath),
    policy,
  });
}

if (pages.length === 0) {
  throw new TypeError("No application HTML files were hardened.");
}

await mkdir(reportDirectory, { recursive: true });
await writeFile(
  path.join(reportDirectory, "content-security-policy.json"),
  `${JSON.stringify({ pages, version: 1 }, null, 2)}\n`,
);
process.stdout.write(`Added a hash-based Content Security Policy to ${pages.length} HTML files.\n`);
