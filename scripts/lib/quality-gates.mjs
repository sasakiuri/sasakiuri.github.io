import rawQualityGates from "../../config/quality-gates.json" with { type: "json" };

export const qualityGates = validateQualityGates(rawQualityGates);

export function validateQualityGates(value) {
  assertRecord(value, "quality gates");
  assertExactKeys(value, ["$schema", "artifact", "lighthouse", "syntheticMonitoring"], "quality gates");
  assertRecord(value.artifact, "artifact quality gates");
  assertExactKeys(value.artifact, ["maximumBytes", "requiredPaths"], "artifact quality gates");
  assertRecord(value.artifact.maximumBytes, "artifact byte budgets");
  assertExactKeys(
    value.artifact.maximumBytes,
    ["css", "fonts", "html", "images", "individualFile", "javascript", "total"],
    "artifact byte budgets",
  );

  for (const name of ["css", "fonts", "html", "images", "individualFile", "javascript", "total"]) {
    assertPositiveInteger(value.artifact.maximumBytes[name], `artifact.maximumBytes.${name}`);
  }

  const requiredPaths = value.artifact.requiredPaths;
  if (
    !Array.isArray(requiredPaths) ||
    requiredPaths.length === 0 ||
    requiredPaths.some(
      (filePath) =>
        typeof filePath !== "string" ||
        filePath.length === 0 ||
        filePath.startsWith("/") ||
        filePath.split("/").includes(".."),
    ) ||
    new Set(requiredPaths).size !== requiredPaths.length
  ) {
    throw new TypeError("artifact.requiredPaths must contain unique, safe, relative paths.");
  }

  assertRecord(value.lighthouse, "Lighthouse quality gates");
  assertExactKeys(
    value.lighthouse,
    [
      "accessibility",
      "bestPractices",
      "cumulativeLayoutShift",
      "largestContentfulPaintMilliseconds",
      "performance",
      "seo",
      "totalBlockingTimeMilliseconds",
    ],
    "Lighthouse quality gates",
  );
  for (const name of ["accessibility", "bestPractices", "performance", "seo"]) {
    assertScore(value.lighthouse[name], `lighthouse.${name}`);
  }
  assertNonNegativeNumber(value.lighthouse.cumulativeLayoutShift, "lighthouse.cumulativeLayoutShift");
  assertPositiveInteger(
    value.lighthouse.largestContentfulPaintMilliseconds,
    "lighthouse.largestContentfulPaintMilliseconds",
  );
  assertPositiveInteger(value.lighthouse.totalBlockingTimeMilliseconds, "lighthouse.totalBlockingTimeMilliseconds");

  assertRecord(value.syntheticMonitoring, "synthetic monitoring quality gates");
  assertExactKeys(
    value.syntheticMonitoring,
    ["certificateMinimumRemainingDays", "maximumResponseMilliseconds", "requestTimeoutMilliseconds", "retries"],
    "synthetic monitoring quality gates",
  );
  for (const name of [
    "certificateMinimumRemainingDays",
    "maximumResponseMilliseconds",
    "requestTimeoutMilliseconds",
    "retries",
  ]) {
    assertPositiveInteger(value.syntheticMonitoring[name], `syntheticMonitoring.${name}`);
  }

  return deepFreeze(value);
}

function assertRecord(value, name) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object.`);
  }
}

function assertExactKeys(value, expectedKeys, name) {
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  if (
    actualKeys.length !== sortedExpectedKeys.length ||
    actualKeys.some((key, index) => key !== sortedExpectedKeys[index])
  ) {
    throw new TypeError(`${name} has missing or unknown properties.`);
  }
}

function assertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer.`);
  }
}

function assertScore(value, name) {
  assertNonNegativeNumber(value, name);
  if (value > 1) {
    throw new TypeError(`${name} must not exceed 1.`);
  }
}

function assertNonNegativeNumber(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${name} must be a finite non-negative number.`);
  }
}

function deepFreeze(value) {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}
