import { createHash } from "node:crypto";

const documentId = "SPDXRef-DOCUMENT";
const packageId = "SPDXRef-Package-static-export";

export function createStaticSpdx({ created, manifest }) {
  assertIsoTimestamp(created);
  if (typeof manifest?.treeSha256 !== "string" || !/^[a-f\d]{64}$/u.test(manifest.treeSha256)) {
    throw new TypeError("A sealed artifact manifest is required to generate SPDX evidence.");
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new TypeError("SPDX evidence requires at least one artifact file.");
  }

  const files = manifest.files.map((file, index) => {
    validateFile(file, index);
    return {
      SPDXID: fileSpdxId(file, index),
      checksums: [
        { algorithm: "SHA1", checksumValue: file.sha1 },
        { algorithm: "SHA256", checksumValue: file.sha256 },
      ],
      copyrightText: "NOASSERTION",
      fileName: `./${file.path}`,
      fileTypes: [spdxFileType(file.mediaType)],
      licenseConcluded: "NOASSERTION",
      licenseInfoInFiles: ["NOASSERTION"],
    };
  });

  return {
    SPDXID: documentId,
    creationInfo: {
      created,
      creators: ["Tool: sasakiuri.github.io/scripts/generate-static-sbom.mjs"],
    },
    dataLicense: "CC0-1.0",
    documentNamespace: `https://slithy.net/.well-known/spdx/static-export-${manifest.treeSha256}`,
    files,
    name: `slithy.net-static-export-${manifest.treeSha256.slice(0, 12)}`,
    packages: [
      {
        SPDXID: packageId,
        copyrightText: "NOASSERTION",
        downloadLocation: "NOASSERTION",
        filesAnalyzed: true,
        licenseConcluded: "NOASSERTION",
        licenseDeclared: "NOASSERTION",
        name: "slithy.net static export",
        packageVerificationCode: {
          packageVerificationCodeValue: createPackageVerificationCode(manifest.files),
        },
        primaryPackagePurpose: "APPLICATION",
        versionInfo: manifest.treeSha256,
      },
    ],
    relationships: [
      { relatedSpdxElement: packageId, relationshipType: "DESCRIBES", spdxElementId: documentId },
      ...files.map((file) => ({
        relatedSpdxElement: file.SPDXID,
        relationshipType: "CONTAINS",
        spdxElementId: packageId,
      })),
    ],
    spdxVersion: "SPDX-2.3",
  };
}

export function createPackageVerificationCode(files) {
  const sha1Values = files.map((file, index) => {
    validateFile(file, index);
    return file.sha1;
  });
  sha1Values.sort();
  return createHash("sha1").update(sha1Values.join(""), "ascii").digest("hex");
}

function validateFile(file, index) {
  if (typeof file.sha1 !== "string" || !/^[a-f\d]{40}$/u.test(file.sha1)) {
    throw new TypeError(`Artifact file ${index + 1} has an invalid SHA-1.`);
  }
  if (typeof file.sha256 !== "string" || !/^[a-f\d]{64}$/u.test(file.sha256)) {
    throw new TypeError(`Artifact file ${index + 1} has an invalid SHA-256.`);
  }
  if (typeof file.path !== "string" || file.path.length === 0) {
    throw new TypeError(`Artifact file ${index + 1} has an invalid path.`);
  }
}

function fileSpdxId(file, index) {
  return `SPDXRef-File-${String(index + 1).padStart(4, "0")}-${file.sha256.slice(0, 16)}`;
}

function spdxFileType(mediaType) {
  if (mediaType.startsWith("image/")) return "IMAGE";
  if (mediaType.startsWith("font/")) return "BINARY";
  if (mediaType === "application/octet-stream") return "BINARY";
  return "TEXT";
}

function assertIsoTimestamp(value) {
  const timestamp = typeof value === "string" ? Date.parse(value) : Number.NaN;
  const normalized = Number.isFinite(timestamp) ? new Date(timestamp).toISOString().replace(".000Z", "Z") : "";
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value) || normalized !== value) {
    throw new TypeError("SPDX creation time must be a normalized ISO timestamp.");
  }
}
