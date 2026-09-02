#!/usr/bin/env node

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { createArtifactManifest, verifyArtifactManifest } from "./lib/artifact-manifest.mjs";
import { qualityGates } from "./lib/quality-gates.mjs";
import { collectFiles, digest, digestSha1, readUtf8, toPosixPath } from "./lib/static-export.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const outputDirectory = path.join(projectRoot, "out");
const reportDirectory = path.join(projectRoot, "reports", "artifact");
const contractSourcePath = path.join(projectRoot, "config", "site-contract.json");
const forbiddenFilePattern = /(?:^|\/)(?:\.env(?:\..*)?|id_[^/]+|npm-debug\.log)$|\.(?:key|log|map|pem|ts|tsx)$/iu;
const forbiddenContentPatterns = [
  { label: "private key", pattern: /-----BEGIN (?:EC |OPENSSH |RSA )?PRIVATE KEY-----/u },
  { label: "GitHub token", pattern: /\bgh(?:p|o|u|s|r)_[A-Za-z\d]{36,255}\b/u },
  { label: "Google API key", pattern: /\bAIza[\w-]{35}\b/u },
];

const mode = parseMode(process.argv.slice(2));
const filePaths = await collectFiles(outputDirectory);
const relativePaths = new Set(filePaths.map((filePath) => toPosixPath(outputDirectory, filePath)));

for (const requiredPath of qualityGates.artifact.requiredPaths) {
  if (!relativePaths.has(requiredPath)) throw new TypeError(`Static export is missing required path: ${requiredPath}`);
}

const totals = { css: 0, fonts: 0, html: 0, images: 0, javascript: 0, total: 0 };
const files = [];

for (const filePath of filePaths) {
  const relativePath = toPosixPath(outputDirectory, filePath);
  if (forbiddenFilePattern.test(relativePath))
    throw new TypeError(`Forbidden file type in static export: ${relativePath}`);

  const [body, metadata] = await Promise.all([readFile(filePath), stat(filePath)]);
  if (metadata.nlink !== 1) throw new TypeError(`Static exports must not contain hard links: ${relativePath}`);
  const decodedBody = body.toString("utf8");
  for (const { label, pattern } of forbiddenContentPatterns) {
    if (pattern.test(decodedBody)) throw new TypeError(`Possible ${label} in static export: ${relativePath}`);
  }
  if (metadata.size > qualityGates.artifact.maximumBytes.individualFile) {
    throw new TypeError(
      `${relativePath} is ${metadata.size} bytes; the per-file budget is ${qualityGates.artifact.maximumBytes.individualFile}.`,
    );
  }

  const category = classify(relativePath);
  totals.total += metadata.size;
  if (category !== undefined) totals[category] += metadata.size;
  files.push({
    bytes: metadata.size,
    mediaType: mediaType(relativePath),
    path: relativePath,
    sha1: digestSha1(body),
    sha256: digest(body),
    sri: `sha256-${digest(body, "base64")}`,
  });
}

for (const [name, maximum] of Object.entries(qualityGates.artifact.maximumBytes)) {
  if (name === "individualFile") continue;
  const actual = totals[name];
  if (typeof actual !== "number" || actual > maximum) {
    throw new TypeError(`Static export ${name} size is ${actual ?? "unknown"} bytes; the budget is ${maximum}.`);
  }
}

const contractSource = await readFile(contractSourcePath);
const contractSha256 = digest(contractSource);

if (mode.kind === "verify") {
  const expected = JSON.parse(await readUtf8(path.resolve(projectRoot, mode.manifestPath)));
  const { sealSha256, treeSha256 } = verifyArtifactManifest({
    actualFiles: files,
    actualTotals: totals,
    contractSha256,
    expected,
    ...(mode.trustedSealSha256 === undefined ? {} : { trustedSealSha256: mode.trustedSealSha256 }),
  });
  process.stdout.write(`Verified ${files.length} promoted files against seal ${sealSha256} and tree ${treeSha256}.\n`);
  process.exit(0);
}

const [{ parseHtmlDocument, tokenize }, { verifyPublicationContract }] = await Promise.all([
  import("./lib/html-contract.mjs"),
  import("./lib/publication-contract.mjs"),
]);

const htmlEdges = await Promise.all(
  filePaths.filter((filePath) => filePath.endsWith(".html")).map((filePath) => verifyHtml(filePath, relativePaths)),
);
const cssEdges = await verifyCssResources(filePaths, relativePaths);

const fileShaByPath = new Map(files.map((file) => [file.path, file.sha256]));
const publicationEvidence = await verifyPublicationContract({
  availablePaths: relativePaths,
  fileShaByPath,
  initialEdges: [...htmlEdges.flat(), ...cssEdges],
  outputDirectory,
});
const contract = {
  ...publicationEvidence,
  source: {
    path: "config/site-contract.json",
    sha256: contractSha256,
    version: 1,
  },
};
const manifest = createArtifactManifest({ contract, files, totals });
verifyArtifactManifest({ actualFiles: files, actualTotals: totals, contractSha256, expected: manifest });
await mkdir(reportDirectory, { recursive: true });
await writeFile(path.join(reportDirectory, "static-export-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(
  `Sealed ${files.length} static files (${totals.total} bytes) as seal ${manifest.sealSha256} and tree ${manifest.treeSha256}; verified ${contract.routes.length} routes.\n`,
);

async function verifyHtml(filePath, availablePaths) {
  const html = await readUtf8(filePath);
  if (!html.includes("/_next/")) return [];
  const document = parseHtmlDocument(html);

  const relativePath = toPosixPath(outputDirectory, filePath);
  const edges = [];
  const policies = document.metaByHttpEquiv.get("content-security-policy") ?? [];
  if (policies.length !== 1) {
    throw new TypeError(`Application HTML must contain one Content Security Policy: ${relativePath}`);
  }
  const policy = policies[0] ?? "";
  if (
    !policy.includes("default-src 'none'") ||
    !policy.includes("object-src 'none'") ||
    /script-src[^;]*'unsafe-inline'/u.test(policy)
  ) {
    throw new TypeError(`Application HTML has a weak Content Security Policy: ${relativePath}`);
  }

  for (const { attributes, source } of document.scripts) {
    if (attributes.src !== undefined) continue;
    const expectedHash = `sha256-${digest(Buffer.from(source), "base64")}`;
    if (!policy.includes(`'${expectedHash}'`)) {
      throw new TypeError(`Content Security Policy does not authorize every inline script: ${relativePath}`);
    }
  }

  const directResources = [
    ...document.images.map(({ src }) => src),
    ...document.scripts.map(({ attributes }) => attributes.src),
    ...document.links
      .filter(({ rel }) =>
        tokenize(rel).some((token) =>
          ["apple-touch-icon", "icon", "manifest", "modulepreload", "preload", "stylesheet"].includes(token),
        ),
      )
      .map(({ href }) => href),
  ];
  for (const resource of directResources) {
    if (resource === undefined) continue;
    const target = assertLocalResource(resource, relativePath, availablePaths);
    if (target !== undefined) edges.push({ kind: "html-resource", owner: relativePath, target });
  }

  for (const sourceSet of [...document.images, ...document.sources].map(({ srcset }) => srcset)) {
    if (sourceSet === undefined) continue;
    for (const candidate of sourceSet.split(",")) {
      const resource = candidate.trim().split(/\s+/u)[0];
      if (resource !== undefined && resource !== "") {
        const target = assertLocalResource(resource, relativePath, availablePaths);
        if (target !== undefined) edges.push({ kind: "responsive-resource", owner: relativePath, target });
      }
    }
  }
  return edges;
}

async function verifyCssResources(allFilePaths, availablePaths) {
  const cssFiles = allFilePaths.filter((filePath) => filePath.endsWith(".css"));
  const nestedEdges = await Promise.all(
    cssFiles.map(async (filePath) => {
      const css = await readUtf8(filePath);
      const cssPath = toPosixPath(outputDirectory, filePath);
      const edges = [];
      for (const match of css.matchAll(/url\((?:["']?)([^"')]+)(?:["']?)\)/giu)) {
        const resource = match[1];
        if (resource !== undefined) {
          const target = assertLocalResource(resource, cssPath, availablePaths, path.posix.dirname(cssPath));
          if (target !== undefined) edges.push({ kind: "css-resource", owner: cssPath, target });
        }
      }
      return edges;
    }),
  );
  return nestedEdges.flat();
}

function assertLocalResource(resource, ownerPath, availablePaths, basePath = "") {
  if (/^(?:https?:)?\/\//iu.test(resource)) {
    throw new TypeError(`Executable resource must be same-origin in ${ownerPath}: ${resource}`);
  }
  if (resource.startsWith("#")) return undefined;
  if (/^[a-z][a-z\d+.-]*:/iu.test(resource)) {
    throw new TypeError(`Executable resource uses a forbidden scheme in ${ownerPath}: ${resource}`);
  }

  let decoded;
  try {
    decoded = decodeURIComponent(resource.replaceAll("&amp;", "&").split(/[?#]/u, 1)[0] ?? "");
  } catch {
    throw new TypeError(`Executable resource has invalid encoding in ${ownerPath}: ${resource}`);
  }
  if (decoded.includes("\\") || (decoded.startsWith("/") && decoded.split("/").includes(".."))) {
    throw new TypeError(`Executable resource contains traversal syntax in ${ownerPath}: ${resource}`);
  }
  const withoutLeadingSlash = decoded.replace(/^\/+/, "");
  let normalized = decoded.startsWith("/")
    ? path.posix.normalize(withoutLeadingSlash)
    : path.posix.normalize(path.posix.join(basePath, withoutLeadingSlash));
  if (normalized === "." || normalized === "") normalized = "index.html";
  else if (decoded.endsWith("/")) normalized = path.posix.join(normalized, "index.html");
  if (normalized.startsWith("../") || !availablePaths.has(normalized)) {
    throw new TypeError(`Broken local resource in ${ownerPath}: ${resource} (${normalized})`);
  }
  return normalized;
}

function parseMode(arguments_) {
  if (arguments_.length === 1 && arguments_[0] === "--seal") return { kind: "seal" };
  if (arguments_[0] === "--verify" && typeof arguments_[1] === "string") {
    if (arguments_.length === 2) return { kind: "verify", manifestPath: arguments_[1] };
    if (arguments_.length === 4 && arguments_[2] === "--seal-sha" && typeof arguments_[3] === "string") {
      if (!/^[a-f\d]{64}$/u.test(arguments_[3])) throw new TypeError("Trusted seal SHA-256 is invalid.");
      return { kind: "verify", manifestPath: arguments_[1], trustedSealSha256: arguments_[3] };
    }
  }
  throw new TypeError("Usage: verify-static-export.mjs --seal | --verify <manifest> [--seal-sha <sha256>]");
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
