import { describe, expect, it } from "vitest";

import {
  getPrecachePublicPaths,
  publicPathToArtifactPath,
  siteContract,
  sortOrdinal,
  validateSiteContract,
} from "./site-contract.mjs";

describe("site publication contract", () => {
  it("loads immutable, cross-validated publication data", () => {
    expect(siteContract.routes.personal.url).toBe("https://slithy.net/sasakiuri/");
    expect(Object.isFrozen(siteContract)).toBe(true);
    expect(Object.isFrozen(siteContract.routes.personal.socials)).toBe(true);
    expect(Object.isFrozen(siteContract.pwa.manifest.icons[0])).toBe(true);
  });

  it("derives a unique personal precache shell sorted by ordinal value", () => {
    const paths = getPrecachePublicPaths();

    expect(paths).toEqual(sortOrdinal(paths));
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain("/sasakiuri/");
    expect(paths).toContain("/sasakiuri/manifest.webmanifest");
    expect(paths).toContain(siteContract.routes.personal.socialImage.src);
  });

  it("maps public assets to safe artifact paths", () => {
    expect(publicPathToArtifactPath("/sasakiuri/icon.svg")).toBe("sasakiuri/icon.svg");
    expect(() => publicPathToArtifactPath("/../secret.txt")).toThrow(/normalized absolute public path/u);
  });

  it("sorts without locale-dependent collation", () => {
    expect(sortOrdinal(["z", "A", "a", "10", "2"])).toEqual(["10", "2", "A", "a", "z"]);
  });

  it.each([
    ["unknown top-level properties", (value) => (value.unknown = true)],
    ["an invalid schema reference", (value) => (value.$schema = 42)],
    ["an unsafe artifact path", (value) => (value.routes.personal.artifactPath = "..\\secret")],
    ["an origin containing a path", (value) => (value.origin = "https://slithy.net/path")],
    ["duplicate socials", (value) => value.routes.personal.socials.push(value.routes.personal.socials[0])],
    ["a PWA asset outside its scope", (value) => (value.pwa.manifest.publicPath = "/manifest.webmanifest")],
  ])("rejects %s", (_label, mutate) => {
    const candidate = structuredClone(siteContract);
    mutate(candidate);

    expect(() => validateSiteContract(candidate)).toThrow(TypeError);
  });
});
