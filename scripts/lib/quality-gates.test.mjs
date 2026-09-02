import { describe, expect, it } from "vitest";

import { qualityGates, validateQualityGates } from "./quality-gates.mjs";

describe("quality gates", () => {
  it("loads the policy as deeply immutable data", () => {
    expect(qualityGates.artifact.maximumBytes.individualFile).toBe(307_200);
    expect(qualityGates.artifact.maximumBytes.total).toBe(4_194_304);
    expect(Object.isFrozen(qualityGates)).toBe(true);
    expect(Object.isFrozen(qualityGates.artifact)).toBe(true);
    expect(Object.isFrozen(qualityGates.artifact.requiredPaths)).toBe(true);
  });

  it("rejects scores outside the normalized range", () => {
    const candidate = structuredClone(qualityGates);
    candidate.lighthouse.performance = 1.01;

    expect(() => validateQualityGates(candidate)).toThrow(/lighthouse\.performance/u);
  });

  it("rejects unsafe or duplicate required artifact paths", () => {
    const candidate = structuredClone(qualityGates);
    candidate.artifact.requiredPaths = ["index.html", "../index.html", "index.html"];

    expect(() => validateQualityGates(candidate)).toThrow(/unique, safe, relative paths/u);
  });

  it("rejects non-positive monitoring limits", () => {
    const candidate = structuredClone(qualityGates);
    candidate.syntheticMonitoring.retries = 0;

    expect(() => validateQualityGates(candidate)).toThrow(/syntheticMonitoring\.retries/u);
  });
});
