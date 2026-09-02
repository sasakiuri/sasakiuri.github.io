#!/usr/bin/env node

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { qualityGates } from "./lib/quality-gates.mjs";
import { collectFiles, digest, readUtf8, toPosixPath } from "./lib/static-export.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const outputDirectory = path.join(projectRoot, "out");
const reportDirectory = path.join(projectRoot, "reports", "artifact");
const forbiddenFilePattern = /(?:^|\/)(?:\.env(?:\..*)?|id_[^/]+|npm-debug\.log)$|\.(?:key|log|map|pem|ts|tsx)$/iu;
const inlineScriptPattern = /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/giu;
const activeResourcePattern = /<(?:img|script)\b[^>]*\bsrc=["']([^"']+)["']|<link\b([^>]*)>/giu;
const forbiddenContentPatterns = [
  { label: "private key", pattern: /-----BEGIN (?:EC |OPENSSH |RSA )?PRIVATE KEY-----/u },
  { label: "GitHub token", pattern: /\bgh(?:p|o|u|s|r)_[A-Za-z0-9]{36,255}\b/u },
  { label: "Google API key", pattern: /\bAIza[\w-]{35}\b/u },
];

const filePaths = await collectFiles(outputDirectory);
const relativePaths = new Set(filePaths.map((filePath) => toPosixPath(outputDirectory, filePath)));

for (const requiredPath of qualityGates.artifact.requiredPaths) {
  if (!relativePaths.has(requiredPath)) {
    throw new TypeError(`Static export is missing required path: ${requiredPath}`);
  }
}

const totals = {
  css: 0,
  fonts: 0,
  html: 0,
  images: 0,
  javascript: 0,
  total: 0,
};
const files = [];

for (const filePath of filePaths) {
  const relativePath = toPosixPath(outputDirectory, filePath);
  if (forbiddenFilePattern.test(relativePath)) {
    throw new TypeError(`Forbidden file type in static export: ${relativePath}`);
  }

  const [body, metadata] = await Promise.all([readFile(filePath), stat(filePath)]);
  if (metadata.nlink !== 1) {
    throw new TypeError(`Static exports must not contain hard links: ${relativePath}`);
  }
  const decodedBody = body.toString("utf8");
  for (const { label, pattern } of forbiddenContentPatterns) {
    if (pattern.test(decodedBody)) {
      throw new TypeError(`Possible ${label} in static export: ${relativePath}`);
    }
  }
  if (metadata.size > qualityGates.artifact.maximumBytes.individualFile) {
    throw new TypeError(
      `${relativePath} is ${metadata.size} bytes; the per-file budget is ${qualityGates.artifact.maximumBytes.individualFile}.`,
    );
  }

  const category = classify(relativePath);
  totals.total += metadata.size;
  if (category !== undefined) {
    totals[category] += metadata.size;
  }

  files.push({
    bytes: metadata.size,
    mediaType: mediaType(relativePath),
    path: relativePath,
    sha256: digest(body),
    sri: `sha256-${digest(body, "base64")}`,
  });
}

for (const [name, maximum] of Object.entries(qualityGates.artifact.maximumBytes)) {
  if (name === "individualFile") {
    continue;
  }

  const actual = totals[name];
  if (typeof actual !== "number" || actual > maximum) {
    throw new TypeError(`Static export ${name} size is ${actual ?? "unknown"} bytes; the budget is ${maximum}.`);
  }
}

await Promise.all(
  filePaths.filter((filePath) => filePath.endsWith(".html")).map((filePath) => verifyHtml(filePath, relativePaths)),
);
await verifyCssResources(filePaths, relativePaths);

const serviceWorker = await readUtf8(path.join(outputDirectory, "sasakiuri", "sw.js"));
if (serviceWorker.includes("__PRECACHE_VERSION__") || serviceWorker.includes("__PRECACHE_URLS__")) {
  throw new TypeError("Service Worker precache placeholders were not replaced.");
}

const manifest = {
  algorithm: "sha256",
  files,
  totals,
  version: 1,
};
await mkdir(reportDirectory, { recursive: true });
await writeFile(path.join(reportDirectory, "static-export-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(
  `Verified ${files.length} static files (${totals.total} bytes) and wrote the integrity manifest.\n`,
);

async function verifyHtml(filePath, availablePaths) {
  const html = await readUtf8(filePath);
  if (!html.includes("/_next/")) {
    return;
  }

  const relativePath = toPosixPath(outputDirectory, filePath);
  const policyMatch = html.match(/<meta\s+http-equiv=["']Content-Security-Policy["']\s+content="([^"]+)"\s*\/>/iu);
  if (policyMatch === null) {
    throw new TypeError(`Application HTML is missing Content Security Policy: ${relativePath}`);
  }

  const policy = policyMatch[1] ?? "";
  if (
    !policy.includes("default-src 'none'") ||
    !policy.includes("object-src 'none'") ||
    /script-src[^;]*'unsafe-inline'/u.test(policy)
  ) {
    throw new TypeError(`Application HTML has a weak Content Security Policy: ${relativePath}`);
  }

  for (const [, source = ""] of html.matchAll(inlineScriptPattern)) {
    const expectedHash = `sha256-${digest(Buffer.from(source), "base64")}`;
    if (!policy.includes(`'${expectedHash}'`)) {
      throw new TypeError(`Content Security Policy does not authorize every inline script: ${relativePath}`);
    }
  }

  for (const match of html.matchAll(activeResourcePattern)) {
    const directSource = match[1];
    const linkAttributes = match[2];
    let resource = directSource;

    if (resource === undefined && linkAttributes !== undefined) {
      const rel = linkAttributes.match(/\brel=["']([^"']+)["']/iu)?.[1]?.toLowerCase() ?? "";
      if (!/(?:^|\s)(?:icon|manifest|modulepreload|preload|stylesheet)(?:\s|$)/u.test(rel)) {
        continue;
      }
      resource = linkAttributes.match(/\bhref=["']([^"']+)["']/iu)?.[1];
    }

    if (resource !== undefined) {
      assertLocalResource(resource, relativePath, availablePaths);
    }
  }
}

async function verifyCssResources(allFilePaths, availablePaths) {
  const cssFiles = allFilePaths.filter((filePath) => filePath.endsWith(".css"));
  await Promise.all(
    cssFiles.map(async (filePath) => {
      const css = await readUtf8(filePath);
      const cssPath = toPosixPath(outputDirectory, filePath);
      for (const match of css.matchAll(/url\((?:["']?)([^"')]+)(?:["']?)\)/giu)) {
        const resource = match[1];
        if (resource === undefined) {
          continue;
        }
        assertLocalResource(resource, cssPath, availablePaths, path.posix.dirname(cssPath));
      }
    }),
  );
}

function assertLocalResource(resource, ownerPath, availablePaths, basePath = "") {
  if (/^(?:https?:)?\/\//iu.test(resource)) {
    throw new TypeError(`Executable resource must be same-origin in ${ownerPath}: ${resource}`);
  }
  if (resource.startsWith("#")) {
    return;
  }
  if (/^[a-z][a-z\d+.-]*:/iu.test(resource)) {
    throw new TypeError(`Executable resource uses a forbidden scheme in ${ownerPath}: ${resource}`);
  }

  const decoded = decodeURIComponent(resource.replaceAll("&amp;", "&").split(/[?#]/u, 1)[0] ?? "");
  const withoutLeadingSlash = decoded.replace(/^\/+/, "");
  let normalized = decoded.startsWith("/")
    ? path.posix.normalize(withoutLeadingSlash)
    : path.posix.normalize(path.posix.join(basePath, withoutLeadingSlash));

  if (normalized === "." || normalized === "") {
    normalized = "index.html";
  } else if (decoded.endsWith("/")) {
    normalized = path.posix.join(normalized, "index.html");
  }

  if (normalized.startsWith("../") || !availablePaths.has(normalized)) {
    throw new TypeError(`Broken local resource in ${ownerPath}: ${resource} (${normalized})`);
  }
}

function classify(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".css") return "css";
  if (extension === ".html") return "html";
  if ([".woff", ".woff2", ".otf", ".ttf"].includes(extension)) return "fonts";
  if ([".gif", ".ico", ".jpeg", ".jpg", ".png", ".svg", ".webp"].includes(extension)) return "images";
  if ([".js", ".mjs"].includes(extension)) return "javascript";
  return undefined;
}

function mediaType(filePath) {
  const types = new Map([
    [".css", "text/css"],
    [".html", "text/html"],
    [".ico", "image/x-icon"],
    [".js", "text/javascript"],
    [".json", "application/json"],
    [".png", "image/png"],
    [".svg", "image/svg+xml"],
    [".txt", "text/plain"],
    [".webmanifest", "application/manifest+json"],
    [".webp", "image/webp"],
    [".woff2", "font/woff2"],
    [".xml", "application/xml"],
  ]);
  return types.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream";
}
