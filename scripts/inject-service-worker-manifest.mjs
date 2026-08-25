import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptsDirectory, "..");
const outputDirectory = path.join(projectDirectory, "out");
const serviceWorkerPath = path.join(outputDirectory, "sw.js");
const versionPlaceholder = '"__PRECACHE_VERSION__"';
const urlsPlaceholder = '["__PRECACHE_URLS__"]';

const shellFiles = [
  "apple-touch-icon.png",
  "ea98a6f9-e9a6-43ea-a6e3-464656155004.webp",
  "favicon.ico",
  "icon-192.png",
  "icon-512.png",
  "icon.svg",
  "manifest.webmanifest",
  "opengraph-image.png",
];

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
    }),
  );

  return files.flat();
}

async function assertFile(filePath) {
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) {
    throw new TypeError(`Precache target is not a file: ${filePath}`);
  }
}

const staticDirectory = path.join(outputDirectory, "_next", "static");
const staticFiles = await listFiles(staticDirectory);
const assets = [
  { filePath: path.join(outputDirectory, "index.html"), url: "/" },
  ...shellFiles.map((file) => ({ filePath: path.join(outputDirectory, file), url: `/${file}` })),
  ...staticFiles.map((filePath) => ({
    filePath,
    url: `/${path.relative(outputDirectory, filePath).split(path.sep).join("/")}`,
  })),
].sort((left, right) => left.url.localeCompare(right.url));

await Promise.all(assets.map(({ filePath }) => assertFile(filePath)));

const versionHash = createHash("sha256");
for (const { filePath, url } of assets) {
  versionHash.update(url);
  versionHash.update("\0");
  versionHash.update(await readFile(filePath));
}

const precacheVersion = versionHash.digest("hex").slice(0, 16);
const precacheUrls = assets.map(({ url }) => url);
const template = await readFile(serviceWorkerPath, "utf8");

if (!template.includes(versionPlaceholder) || !template.includes(urlsPlaceholder)) {
  throw new TypeError("Service Worker precache placeholders are missing.");
}

const serviceWorker = template
  .replace(versionPlaceholder, JSON.stringify(precacheVersion))
  .replace(urlsPlaceholder, JSON.stringify(precacheUrls, undefined, 2));

await writeFile(serviceWorkerPath, serviceWorker);
