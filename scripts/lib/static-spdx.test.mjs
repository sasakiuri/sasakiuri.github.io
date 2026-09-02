import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createArtifactManifest } from "./artifact-manifest.mjs";
import { createPackageVerificationCode, createStaticSpdx } from "./static-spdx.mjs";

describe("static export SPDX evidence", () => {
  it("lists every sealed file and relates it to the release package", () => {
    const manifest = fixtureManifest();
    const first = createStaticSpdx({ created: "2026-09-02T00:00:00Z", manifest });
    const second = createStaticSpdx({ created: "2026-09-02T00:00:00Z", manifest });

    expect(first).toEqual(second);
    expect(first.spdxVersion).toBe("SPDX-2.3");
    expect(first.files).toHaveLength(manifest.files.length);
    expect(first.files.map(({ fileName }) => fileName)).toEqual(["./favicon.ico", "./index.html"]);
    expect(
      first.files.every(({ checksums }) => checksums.map(({ algorithm }) => algorithm).join(",") === "SHA1,SHA256"),
    ).toBe(true);
    expect(first.packages[0].packageVerificationCode.packageVerificationCodeValue).toBe(
      createPackageVerificationCode(manifest.files),
    );
    expect(first.packages[0].packageVerificationCode.packageVerificationCodeValue).toMatch(/^[a-f\d]{40}$/u);
    expect(first.relationships.filter(({ relationshipType }) => relationshipType === "CONTAINS")).toHaveLength(
      manifest.files.length,
    );
  });

  it("classifies image, binary, and text evidence", () => {
    const spdx = createStaticSpdx({ created: "2026-09-02T00:00:00Z", manifest: fixtureManifest() });

    expect(spdx.files.map(({ fileTypes }) => fileTypes[0])).toEqual(["IMAGE", "TEXT"]);
  });

  it("rejects unsealed or non-deterministically timestamped input", () => {
    expect(() => createStaticSpdx({ created: "now", manifest: fixtureManifest() })).toThrow(/ISO timestamp/u);
    expect(() =>
      createStaticSpdx({ created: "2026-09-02T00:00:00Z", manifest: { files: [], treeSha256: "x" } }),
    ).toThrow(/sealed artifact/u);
  });
});

function fixtureManifest() {
  const files = [fileRecord("index.html", "html", "text/html"), fileRecord("favicon.ico", "icon", "image/x-icon")];
  return createArtifactManifest({
    contract: { source: { path: "config/site-contract.json", sha256: sha256("contract"), version: 1 } },
    files,
    totals: { css: 0, fonts: 0, html: 4, images: 4, javascript: 0, total: 8 },
  });
}

function fileRecord(path, body, mediaType) {
  const sha = sha256(body);
  return {
    bytes: Buffer.byteLength(body),
    mediaType,
    path,
    sha1: createHash("sha1").update(body).digest("hex"),
    sha256: sha,
    sri: `sha256-${Buffer.from(sha, "hex").toString("base64")}`,
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
