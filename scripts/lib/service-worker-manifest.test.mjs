import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createPrecacheManifest, computePrecacheVersion, renderServiceWorker } from "./service-worker-manifest.mjs";
import { getPrecachePublicPaths, publicPathToArtifactPath } from "./site-contract.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("Service Worker manifest", () => {
  it("derives every declared shell and framework asset with a content version", async () => {
    const outputDirectory = await createOutputFixture();
    const first = await createPrecacheManifest(outputDirectory);
    const second = await createPrecacheManifest(outputDirectory);

    expect(first).toEqual(second);
    expect(first.urls).toEqual([...first.urls].sort());
    expect(first.urls).toContain("/_next/static/chunks/app.js");
    expect(first.urls).toContain("/sasakiuri/");
    expect(first.version).toMatch(/^[a-f\d]{16}$/u);

    await writeFile(path.join(outputDirectory, "_next/static/chunks/app.js"), "changed");
    expect((await createPrecacheManifest(outputDirectory)).version).not.toBe(first.version);
  });

  it("uses length-delimited URL and body fields", async () => {
    const directory = await createTemporaryDirectory();
    const firstPath = path.join(directory, "first");
    const secondPath = path.join(directory, "second");
    await Promise.all([writeFile(firstPath, "c"), writeFile(secondPath, "bc")]);

    const first = await computePrecacheVersion([{ filePath: firstPath, url: "ab" }]);
    const second = await computePrecacheVersion([{ filePath: secondPath, url: "a" }]);

    expect(first).not.toBe(second);
  });

  it("injects each placeholder exactly once", () => {
    const template = [
      'const cachePrefix = "__CACHE_PREFIX__";',
      'const precacheVersion = "__PRECACHE_VERSION__";',
      'const precacheUrls = ["__PRECACHE_URLS__"];',
      'const navigationFallback = "__NAVIGATION_FALLBACK__";',
    ].join("\n");
    const rendered = renderServiceWorker(template, { urls: ["/sasakiuri/"], version: "0123456789abcdef" });

    expect(rendered).toContain('const cachePrefix = "sasakiuri-";');
    expect(rendered).toContain('const precacheVersion = "0123456789abcdef";');
    expect(rendered).toContain('const navigationFallback = "/sasakiuri/";');
    expect(rendered).not.toContain("__PRECACHE");
    expect(() =>
      renderServiceWorker(template.replace("__CACHE_PREFIX__", "missing"), { urls: [], version: "x" }),
    ).toThrow(/exactly once/u);
  });
});

async function createOutputFixture() {
  const outputDirectory = await createTemporaryDirectory();
  for (const publicPath of getPrecachePublicPaths()) {
    const artifactPath = publicPath.endsWith("/")
      ? `${publicPath.slice(1)}index.html`
      : publicPathToArtifactPath(publicPath);
    const filePath = path.join(outputDirectory, artifactPath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, publicPath);
  }
  const frameworkAsset = path.join(outputDirectory, "_next/static/chunks/app.js");
  await mkdir(path.dirname(frameworkAsset), { recursive: true });
  await writeFile(frameworkAsset, "framework");
  expect(await readFile(frameworkAsset, "utf8")).toBe("framework");
  return outputDirectory;
}

async function createTemporaryDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), "slithy-contract-"));
  temporaryDirectories.push(directory);
  return directory;
}
