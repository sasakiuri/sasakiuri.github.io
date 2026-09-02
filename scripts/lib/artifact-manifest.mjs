import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { siteContract, sortOrdinal } from "./site-contract.mjs";

const treeFormat = Buffer.from("slithy-static-tree-v3\0", "utf8");
const sealFormat = Buffer.from("slithy-static-seal-v3\0", "utf8");

export function createArtifactManifest({ contract, files, totals }) {
  const orderedFiles = [...files].sort((left, right) => compareText(left.path, right.path));
  const unsignedManifest = {
    algorithm: "sha256",
    contract,
    files: orderedFiles,
    totals,
    treeSha256: createTreeSha256(orderedFiles),
    version: 3,
  };
  return {
    algorithm: unsignedManifest.algorithm,
    contract: unsignedManifest.contract,
    files: unsignedManifest.files,
    sealSha256: createSealSha256(unsignedManifest),
    totals: unsignedManifest.totals,
    treeSha256: unsignedManifest.treeSha256,
    version: unsignedManifest.version,
  };
}

export function verifyArtifactManifest({ actualFiles, actualTotals, contractSha256, expected, trustedSealSha256 }) {
  validateExpectedManifest(expected);
  const expectedTreeSha256 = createTreeSha256(expected.files);
  if (expected.treeSha256 !== expectedTreeSha256) {
    throw new TypeError("Artifact seal is corrupt: its tree digest does not match its file records.");
  }

  const { sealSha256, ...unsignedManifest } = expected;
  const expectedSealSha256 = createSealSha256(unsignedManifest);
  if (sealSha256 !== expectedSealSha256) {
    throw new TypeError("Artifact seal is corrupt: its seal digest does not cover its complete evidence.");
  }
  if (trustedSealSha256 !== undefined) {
    if (!isSha256(trustedSealSha256)) throw new TypeError("Trusted workflow seal digest is invalid.");
    if (sealSha256 !== trustedSealSha256) {
      throw new TypeError("Artifact seal does not match the trusted workflow seal digest.");
    }
  }
  if (expected.contract.source.sha256 !== contractSha256) {
    throw new TypeError("Artifact seal was created from a different site contract.");
  }

  const orderedActualFiles = [...actualFiles].sort((left, right) => compareText(left.path, right.path));
  const differences = compareFiles(expected.files, orderedActualFiles);
  if (differences.length > 0) {
    throw new TypeError(`Promoted artifact differs from its seal:\n- ${differences.join("\n- ")}`);
  }
  if (!isDeepStrictEqual(actualTotals, expected.totals)) {
    throw new TypeError("Promoted artifact byte totals differ from its seal.");
  }

  const actualTreeSha256 = createTreeSha256(orderedActualFiles);
  if (actualTreeSha256 !== expected.treeSha256) {
    throw new TypeError("Promoted artifact tree digest differs from its seal.");
  }
  return { sealSha256, treeSha256: actualTreeSha256 };
}

export function compareFiles(expectedFiles, actualFiles) {
  const expected = new Map(expectedFiles.map((file) => [file.path, file]));
  const actual = new Map(actualFiles.map((file) => [file.path, file]));
  const paths = sortOrdinal([...new Set([...expected.keys(), ...actual.keys()])]);
  return paths.flatMap((filePath) => {
    const expectedFile = expected.get(filePath);
    const actualFile = actual.get(filePath);
    if (expectedFile === undefined) return [`added ${filePath}`];
    if (actualFile === undefined) return [`removed ${filePath}`];
    if (expectedFile.sha256 !== actualFile.sha256) return [`content changed ${filePath}`];
    if (expectedFile.bytes !== actualFile.bytes) return [`size changed ${filePath}`];
    if (expectedFile.mediaType !== actualFile.mediaType) return [`media type changed ${filePath}`];
    if (expectedFile.sha1 !== actualFile.sha1) return [`SHA-1 changed ${filePath}`];
    if (expectedFile.sri !== actualFile.sri) return [`SRI changed ${filePath}`];
    return [];
  });
}

function createTreeSha256(files) {
  const hash = createHash("sha256");
  hash.update(treeFormat);
  for (const file of files) {
    updateLengthPrefixed(hash, file.path);
    updateLengthPrefixed(hash, String(file.bytes));
    updateLengthPrefixed(hash, file.mediaType);
    updateLengthPrefixed(hash, file.sha1);
    updateLengthPrefixed(hash, file.sha256);
  }
  return hash.digest("hex");
}

function createSealSha256(unsignedManifest) {
  const hash = createHash("sha256");
  hash.update(sealFormat);
  updateLengthPrefixed(hash, canonicalJson(unsignedManifest));
  return hash.digest("hex");
}

function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Artifact evidence contains a non-finite number.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const keys = sortOrdinal(Object.keys(value));
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  throw new TypeError("Artifact evidence must contain JSON values only.");
}

function validateExpectedManifest(manifest) {
  assertRecord(manifest, "artifact seal");
  assertExactKeys(
    manifest,
    ["algorithm", "contract", "files", "sealSha256", "totals", "treeSha256", "version"],
    "artifact seal",
  );
  if (
    manifest.algorithm !== "sha256" ||
    manifest.version !== 3 ||
    !isSha256(manifest.sealSha256) ||
    !isSha256(manifest.treeSha256)
  ) {
    throw new TypeError("Artifact seal algorithm, version, or digest is invalid.");
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new TypeError("Artifact seal files must be a non-empty array.");
  }
  for (const file of manifest.files) validateFileRecord(file);
  const paths = manifest.files.map(({ path }) => path);
  if (new Set(paths).size !== paths.length || !isDeepStrictEqual(paths, sortOrdinal(paths))) {
    throw new TypeError("Artifact seal files must have unique paths sorted by ordinal value.");
  }
  validateTotals(manifest.totals, manifest.files);
  validateContractEvidence(manifest.contract, manifest.files);
}

function validateTotals(totals, files) {
  assertRecord(totals, "artifact seal totals");
  assertExactKeys(totals, ["css", "fonts", "html", "images", "javascript", "total"], "artifact seal totals");
  for (const [name, total] of Object.entries(totals)) {
    if (!Number.isSafeInteger(total) || total < 0) throw new TypeError(`Artifact seal ${name} total is invalid.`);
  }
  const fileTotal = files.reduce((total, file) => total + file.bytes, 0);
  if (totals.total !== fileTotal) throw new TypeError("Artifact seal total does not match its file records.");
}

function validateContractEvidence(contract, files) {
  assertRecord(contract, "artifact contract evidence");
  assertExactKeys(contract, ["assetGraph", "discovery", "pwa", "routes", "source"], "artifact contract evidence");
  const fileByPath = new Map(files.map((file) => [file.path, file]));

  validateAssetGraph(contract.assetGraph, fileByPath);

  assertRecord(contract.discovery, "discovery evidence");
  assertExactKeys(contract.discovery, ["robots", "sitemap"], "discovery evidence");
  validateFileEvidence(
    contract.discovery.robots,
    "robots evidence",
    fileByPath,
    siteContract.discovery.robotsArtifactPath,
  );
  validateFileEvidence(
    contract.discovery.sitemap,
    "sitemap evidence",
    fileByPath,
    siteContract.discovery.sitemapArtifactPath,
    ["urls"],
  );
  const expectedCanonicalUrls = [siteContract.routes.root.url, siteContract.routes.personal.url];
  if (!isDeepStrictEqual(contract.discovery.sitemap.urls, expectedCanonicalUrls)) {
    throw new TypeError("Sitemap evidence URLs do not match the route contract.");
  }

  assertRecord(contract.pwa, "PWA evidence");
  assertExactKeys(contract.pwa, ["manifest", "serviceWorker"], "PWA evidence");
  validateFileEvidence(
    contract.pwa.manifest,
    "web manifest evidence",
    fileByPath,
    siteContract.pwa.manifest.publicPath.slice(1),
    ["icons"],
  );
  if (contract.pwa.manifest.icons !== siteContract.pwa.manifest.icons.length) {
    throw new TypeError("Web manifest evidence icon count is invalid.");
  }
  validateFileEvidence(
    contract.pwa.serviceWorker,
    "Service Worker evidence",
    fileByPath,
    siteContract.pwa.serviceWorker.publicPath.slice(1),
    ["precacheEntries", "version"],
  );
  if (
    !Number.isSafeInteger(contract.pwa.serviceWorker.precacheEntries) ||
    contract.pwa.serviceWorker.precacheEntries < 1 ||
    typeof contract.pwa.serviceWorker.version !== "string" ||
    !/^[a-f\d]{16}$/u.test(contract.pwa.serviceWorker.version)
  ) {
    throw new TypeError("Service Worker evidence is invalid.");
  }

  if (!Array.isArray(contract.routes) || contract.routes.length !== 2) {
    throw new TypeError("Route evidence must describe exactly two routes.");
  }
  const expectedRoutes = [siteContract.routes.root, siteContract.routes.personal];
  for (const [index, routeEvidence] of contract.routes.entries()) {
    const route = expectedRoutes[index];
    validateFileEvidence(routeEvidence, `route ${index + 1} evidence`, fileByPath, route.artifactPath, [
      "canonicalUrl",
      "externalLinks",
      "path",
    ]);
    const expectedExternalLinks =
      route === siteContract.routes.personal ? [route.hero.sourceUrl, ...route.socials.map(({ href }) => href)] : [];
    if (
      routeEvidence.path !== route.path ||
      routeEvidence.canonicalUrl !== route.url ||
      !isDeepStrictEqual(routeEvidence.externalLinks, expectedExternalLinks)
    ) {
      throw new TypeError(`Route ${route.path} evidence does not match the site contract.`);
    }
  }

  assertRecord(contract.source, "artifact contract source");
  assertExactKeys(contract.source, ["path", "sha256", "version"], "artifact contract source");
  if (
    contract.source.path !== "config/site-contract.json" ||
    contract.source.version !== siteContract.version ||
    !isSha256(contract.source.sha256)
  ) {
    throw new TypeError("Artifact contract source evidence is invalid.");
  }
}

function validateAssetGraph(graph, fileByPath) {
  assertRecord(graph, "asset graph evidence");
  assertExactKeys(graph, ["edges", "nodes"], "asset graph evidence");
  if (graph.nodes !== fileByPath.size || !Array.isArray(graph.edges)) {
    throw new TypeError("Asset graph evidence node or edge count is invalid.");
  }
  const edgeKeys = [];
  for (const edge of graph.edges) {
    assertRecord(edge, "asset graph edge");
    assertExactKeys(edge, ["kind", "owner", "target"], "asset graph edge");
    if (![edge.kind, edge.owner, edge.target].every((value) => typeof value === "string" && value.length > 0)) {
      throw new TypeError("Asset graph edge fields must be non-empty text.");
    }
    if (!fileByPath.has(edge.owner)) throw new TypeError(`Asset graph owner is missing: ${edge.owner}`);
    if (edge.kind === "external-link") assertSafeHttpsUrl(edge.target, "asset graph external target");
    else if (!fileByPath.has(edge.target)) throw new TypeError(`Asset graph target is missing: ${edge.target}`);
    edgeKeys.push(`${edge.owner}\0${edge.kind}\0${edge.target}`);
  }
  if (new Set(edgeKeys).size !== edgeKeys.length || !isDeepStrictEqual(edgeKeys, sortOrdinal(edgeKeys))) {
    throw new TypeError("Asset graph edges must be unique and sorted by ordinal value.");
  }
}

function validateFileEvidence(value, label, fileByPath, expectedPath, additionalKeys = []) {
  assertRecord(value, label);
  assertExactKeys(value, ["artifactPath", "sha256", ...additionalKeys], label);
  if (value.artifactPath !== expectedPath || !isSha256(value.sha256)) {
    throw new TypeError(`${label} path or digest is invalid.`);
  }
  if (fileByPath.get(value.artifactPath)?.sha256 !== value.sha256) {
    throw new TypeError(`${label} digest does not match its sealed file.`);
  }
}

function validateFileRecord(file) {
  assertRecord(file, "artifact file record");
  assertExactKeys(file, ["bytes", "mediaType", "path", "sha1", "sha256", "sri"], "artifact file record");
  if (!Number.isSafeInteger(file.bytes) || file.bytes < 0) throw new TypeError("Artifact file byte count is invalid.");
  if (typeof file.mediaType !== "string" || file.mediaType.length === 0 || /[\r\n]/u.test(file.mediaType)) {
    throw new TypeError("Artifact file media type is invalid.");
  }
  if (
    typeof file.path !== "string" ||
    file.path.startsWith("/") ||
    file.path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new TypeError("Artifact file path is invalid.");
  }
  if (!isSha1(file.sha1)) throw new TypeError("Artifact file SHA-1 is invalid.");
  if (!isSha256(file.sha256) || file.sri !== `sha256-${Buffer.from(file.sha256, "hex").toString("base64")}`) {
    throw new TypeError("Artifact file digest or SRI is invalid.");
  }
}

function isSha1(value) {
  return typeof value === "string" && /^[a-f\d]{40}$/u.test(value);
}

function isSha256(value) {
  return typeof value === "string" && /^[a-f\d]{64}$/u.test(value);
}

function assertSafeHttpsUrl(value, name) {
  if (typeof value !== "string") throw new TypeError(`${name} must be an HTTPS URL.`);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError(`${name} must be an HTTPS URL.`);
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
    throw new TypeError(`${name} must be a safe HTTPS URL.`);
  }
}

function updateLengthPrefixed(hash, value) {
  const body = Buffer.from(value, "utf8");
  const length = Buffer.allocUnsafe(8);
  length.writeBigUInt64BE(BigInt(body.byteLength));
  hash.update(length);
  hash.update(body);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertRecord(value, name) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object.`);
  }
}

function assertExactKeys(value, expectedKeys, name) {
  const actualKeys = sortOrdinal(Object.keys(value));
  const sortedExpectedKeys = sortOrdinal(expectedKeys);
  if (
    actualKeys.length !== sortedExpectedKeys.length ||
    actualKeys.some((key, index) => key !== sortedExpectedKeys[index])
  ) {
    throw new TypeError(`${name} has missing or unknown properties.`);
  }
}
