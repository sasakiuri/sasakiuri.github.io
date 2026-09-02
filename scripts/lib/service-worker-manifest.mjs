import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { getPrecachePublicPaths, publicPathToArtifactPath, siteContract, sortOrdinal } from "./site-contract.mjs";
import { collectFiles, toPosixPath } from "./static-export.mjs";

const manifestFormat = Buffer.from("slithy-precache-v2\0", "utf8");

export async function createPrecacheManifest(outputDirectory) {
  const staticDirectory = path.join(outputDirectory, "_next", "static");
  const staticFiles = await collectFiles(staticDirectory);
  const declaredAssets = getPrecachePublicPaths().map((publicPath) => ({
    filePath: path.join(outputDirectory, routeOrAssetToArtifactPath(publicPath)),
    url: publicPath,
  }));
  const frameworkAssets = staticFiles.map((filePath) => ({
    filePath,
    url: `/${toPosixPath(outputDirectory, filePath)}`,
  }));
  const assets = sortAssets([...declaredAssets, ...frameworkAssets]);

  assertUnique(
    assets.map(({ url }) => url),
    "Service Worker precache URLs",
  );
  await Promise.all(assets.map(({ filePath }) => assertRegularFile(filePath)));

  return {
    assets,
    urls: assets.map(({ url }) => url),
    version: await computePrecacheVersion(assets),
  };
}

export async function computePrecacheVersion(assets) {
  const versionHash = createHash("sha256");
  versionHash.update(manifestFormat);
  for (const { filePath, url } of assets) {
    updateLengthPrefixed(versionHash, Buffer.from(url, "utf8"));
    updateLengthPrefixed(versionHash, await readFile(filePath));
  }
  return versionHash.digest("hex").slice(0, 16);
}

export function renderServiceWorker(template, manifest) {
  const replacements = new Map([
    ['"__CACHE_PREFIX__"', JSON.stringify(siteContract.pwa.serviceWorker.cachePrefix)],
    ['"__NAVIGATION_FALLBACK__"', JSON.stringify(siteContract.pwa.serviceWorker.navigationFallback)],
    ['"__PRECACHE_VERSION__"', JSON.stringify(manifest.version)],
    ['["__PRECACHE_URLS__"]', JSON.stringify(manifest.urls, undefined, 2)],
  ]);

  let serviceWorker = template;
  for (const [placeholder, replacement] of replacements) {
    if (countOccurrences(serviceWorker, placeholder) !== 1) {
      throw new TypeError(`Service Worker placeholder must occur exactly once: ${placeholder}`);
    }
    serviceWorker = serviceWorker.replace(placeholder, replacement);
  }
  return serviceWorker;
}

function routeOrAssetToArtifactPath(publicPath) {
  return publicPath.endsWith("/") ? `${publicPath.slice(1)}index.html` : publicPathToArtifactPath(publicPath);
}

function sortAssets(assets) {
  const orderedUrls = sortOrdinal(assets.map(({ url }) => url));
  const byUrl = new Map(assets.map((asset) => [asset.url, asset]));
  return orderedUrls.map((url) => byUrl.get(url));
}

function updateLengthPrefixed(hash, value) {
  const length = Buffer.allocUnsafe(8);
  length.writeBigUInt64BE(BigInt(value.byteLength));
  hash.update(length);
  hash.update(value);
}

async function assertRegularFile(filePath) {
  const metadata = await stat(filePath);
  if (!metadata.isFile()) throw new TypeError(`Precache target is not a file: ${filePath}`);
}

function assertUnique(values, name) {
  if (new Set(values).size !== values.length) throw new TypeError(`${name} must be unique.`);
}

function countOccurrences(value, search) {
  return value.split(search).length - 1;
}
