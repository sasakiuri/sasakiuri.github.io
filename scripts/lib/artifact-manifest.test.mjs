import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { compareFiles, createArtifactManifest, verifyArtifactManifest } from "./artifact-manifest.mjs";
import { siteContract } from "./site-contract.mjs";

const contractSha256 = sha256("contract");
const files = [
  fileRecord("sasakiuri/sw.js", "service worker", "text/javascript"),
  fileRecord("sasakiuri/manifest.webmanifest", "manifest", "application/manifest+json"),
  fileRecord("sitemap.xml", "sitemap", "application/xml"),
  fileRecord("robots.txt", "robots", "text/plain"),
  fileRecord("sasakiuri/index.html", "personal", "text/html"),
  fileRecord("sasakuri/diary/index.html", "diary", "text/html"),
  fileRecord("index.html", "root", "text/html"),
];
const totals = {
  css: 0,
  fonts: 0,
  html: files.filter(({ mediaType }) => mediaType === "text/html").reduce((total, file) => total + file.bytes, 0),
  images: 0,
  javascript: files
    .filter(({ mediaType }) => mediaType === "text/javascript")
    .reduce((total, file) => total + file.bytes, 0),
  total: files.reduce((total, file) => total + file.bytes, 0),
};

describe("artifact integrity seal", () => {
  it("seals files and complete semantic evidence deterministically", () => {
    const expected = manifest();

    expect(
      verifyArtifactManifest({
        actualFiles: files,
        actualTotals: totals,
        contractSha256,
        expected,
        trustedSealSha256: expected.sealSha256,
      }),
    ).toEqual({ sealSha256: expected.sealSha256, treeSha256: expected.treeSha256 });
    expect(expected.files.map(({ path }) => path)).toEqual([
      "index.html",
      "robots.txt",
      "sasakiuri/index.html",
      "sasakiuri/manifest.webmanifest",
      "sasakiuri/sw.js",
      "sasakuri/diary/index.html",
      "sitemap.xml",
    ]);
  });

  it("classifies added, removed, and changed files", () => {
    const first = [fileRecord("index.html", "hello", "text/html")];
    const added = fileRecord("new.txt", "new", "text/plain");
    expect(compareFiles(first, [...first, added])).toEqual(["added new.txt"]);
    expect(compareFiles(first, [])).toEqual(["removed index.html"]);
    expect(compareFiles(first, [fileRecord("index.html", "other", "text/html")])).toEqual([
      "content changed index.html",
    ]);
    expect(compareFiles(first, [{ ...first[0], bytes: 6 }])).toEqual(["size changed index.html"]);
    expect(compareFiles(first, [{ ...first[0], mediaType: "text/plain" }])).toEqual(["media type changed index.html"]);
    expect(compareFiles(first, [{ ...first[0], sha1: sha1("other") }])).toEqual(["SHA-1 changed index.html"]);
    expect(compareFiles(first, [{ ...first[0], sri: "sha256-invalid" }])).toEqual(["SRI changed index.html"]);
  });

  it("rejects tree, full-evidence seal, and trust-boundary corruption", () => {
    const expected = manifest();
    expect(() => verify({ ...expected, treeSha256: sha256("corrupt") })).toThrow(/tree digest/u);

    const changedEvidence = structuredClone(expected);
    changedEvidence.contract.assetGraph.edges.push({
      kind: "document-link",
      owner: "index.html",
      target: "index.html",
    });
    expect(() => verify(changedEvidence)).toThrow(/seal digest/u);

    expect(() =>
      verifyArtifactManifest({
        actualFiles: files,
        actualTotals: totals,
        contractSha256,
        expected,
        trustedSealSha256: sha256("other seal"),
      }),
    ).toThrow(/trusted workflow seal digest/u);
    expect(() =>
      verifyArtifactManifest({
        actualFiles: files,
        actualTotals: totals,
        contractSha256: sha256("other contract"),
        expected,
      }),
    ).toThrow(/different site contract/u);
  });

  it("strictly validates evidence shape and evidence-to-file hashes", () => {
    const unknownProperty = structuredClone(manifest());
    unknownProperty.contract.unknown = true;
    expect(() => verify(unknownProperty)).toThrow(/missing or unknown properties/u);

    const hashDrift = structuredClone(manifest());
    hashDrift.contract.routes[0].sha256 = sha256("different root");
    expect(() => verify(hashDrift)).toThrow(/does not match its sealed file/u);
  });

  it("rejects artifact and totals drift without rewriting the seal", () => {
    const expected = manifest();
    const changedFiles = files.map((file) =>
      file.path === "index.html" ? fileRecord("index.html", "other", "text/html") : file,
    );
    expect(() =>
      verifyArtifactManifest({
        actualFiles: changedFiles,
        actualTotals: totals,
        contractSha256,
        expected,
      }),
    ).toThrow(/content changed index\.html/u);
    expect(() =>
      verifyArtifactManifest({
        actualFiles: files,
        actualTotals: { ...totals, total: totals.total + 1 },
        contractSha256,
        expected,
      }),
    ).toThrow(/byte totals/u);
  });
});

function verify(expected) {
  return verifyArtifactManifest({ actualFiles: files, actualTotals: totals, contractSha256, expected });
}

function manifest() {
  const fileByPath = new Map(files.map((file) => [file.path, file]));
  const fileEvidence = (artifactPath) => ({ artifactPath, sha256: fileByPath.get(artifactPath).sha256 });
  return createArtifactManifest({
    contract: {
      assetGraph: { edges: [], nodes: files.length },
      discovery: {
        robots: fileEvidence(siteContract.discovery.robotsArtifactPath),
        sitemap: {
          ...fileEvidence(siteContract.discovery.sitemapArtifactPath),
          urls: [siteContract.routes.root.url, siteContract.routes.personal.url, siteContract.routes.diary.url],
        },
      },
      pwa: {
        manifest: {
          ...fileEvidence(siteContract.pwa.manifest.publicPath.slice(1)),
          icons: siteContract.pwa.manifest.icons.length,
        },
        serviceWorker: {
          ...fileEvidence(siteContract.pwa.serviceWorker.publicPath.slice(1)),
          precacheEntries: 1,
          version: "0123456789abcdef",
        },
      },
      routes: [siteContract.routes.root, siteContract.routes.personal, siteContract.routes.diary].map((route) => ({
        ...fileEvidence(route.artifactPath),
        canonicalUrl: route.url,
        externalLinks:
          route === siteContract.routes.personal
            ? [route.hero.sourceUrl, ...route.socials.map(({ href }) => href)]
            : [],
        path: route.path,
      })),
      source: { path: "config/site-contract.json", sha256: contractSha256, version: siteContract.version },
    },
    files,
    totals,
  });
}

function fileRecord(path, body, mediaType) {
  const bytes = Buffer.from(body);
  const hash = sha256(body);
  return {
    bytes: bytes.byteLength,
    mediaType,
    path,
    sha1: sha1(body),
    sha256: hash,
    sri: `sha256-${Buffer.from(hash, "hex").toString("base64")}`,
  };
}

function sha1(value) {
  return createHash("sha1").update(value).digest("hex");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
