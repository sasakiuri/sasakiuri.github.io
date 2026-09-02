import { describe, expect, it } from "vitest";

import { siteConfig, siteConfigSchema, siteContract, siteContractSchema } from "./site";

describe("siteConfig", () => {
  it("matches the runtime schema and is deeply immutable", () => {
    expect(siteConfigSchema.parse(siteConfig)).toEqual(siteConfig);
    expect(Object.isFrozen(siteConfig)).toBe(true);
    expect(Object.isFrozen(siteConfig.hero)).toBe(true);
    expect(Object.isFrozen(siteConfig.hero.image)).toBe(true);
    expect(Object.isFrozen(siteConfig.socials)).toBe(true);
    expect(Object.isFrozen(siteConfig.socials[0])).toBe(true);
    expect(Object.isFrozen(siteContract)).toBe(true);
    expect(Object.isFrozen(siteContract.pwa)).toBe(true);
    expect(Object.isFrozen(siteContract.pwa.manifest.icons)).toBe(true);
  });

  it("rejects invalid image dimensions", () => {
    expect(() =>
      siteConfigSchema.parse({
        ...siteConfig,
        hero: {
          ...siteConfig.hero,
          image: {
            ...siteConfig.hero.image,
            width: 0,
          },
        },
      }),
    ).toThrow();
  });

  it("rejects protocol-relative asset URLs", () => {
    expect(() =>
      siteConfigSchema.parse({
        ...siteConfig,
        hero: {
          ...siteConfig.hero,
          image: {
            ...siteConfig.hero.image,
            src: "//cdn.example.com/hero.webp",
          },
        },
      }),
    ).toThrow();
  });

  it.each([
    [
      "a mismatched Service Worker scope",
      (candidate: MutableSiteContract) => (candidate.pwa.serviceWorker.scope = "/other/"),
    ],
    [
      "a mismatched navigation fallback",
      (candidate: MutableSiteContract) => (candidate.pwa.serviceWorker.navigationFallback = "/other/"),
    ],
    [
      "a mismatched manifest short name",
      (candidate: MutableSiteContract) => (candidate.pwa.manifest.shortName = "Other"),
    ],
    [
      "a personal asset outside its scope",
      (candidate: MutableSiteContract) => candidate.pwa.serviceWorker.additionalPrecachePaths.push("/outside/icon.svg"),
    ],
    [
      "duplicate social URLs",
      (candidate: MutableSiteContract) => {
        requiredItem(candidate.routes.personal.socials, 1).href = requiredItem(
          candidate.routes.personal.socials,
          0,
        ).href;
      },
    ],
    [
      "duplicate social labels",
      (candidate: MutableSiteContract) => {
        requiredItem(candidate.routes.personal.socials, 1).label = requiredItem(
          candidate.routes.personal.socials,
          0,
        ).label;
      },
    ],
    [
      "duplicate manifest categories",
      (candidate: MutableSiteContract) =>
        candidate.pwa.manifest.categories.push(requiredItem(candidate.pwa.manifest.categories, 0)),
    ],
    [
      "duplicate manifest icon purposes",
      (candidate: MutableSiteContract) => {
        requiredItem(candidate.pwa.manifest.icons, 1).purpose = requiredItem(candidate.pwa.manifest.icons, 0).purpose;
      },
    ],
    [
      "duplicate additional precache paths",
      (candidate: MutableSiteContract) =>
        candidate.pwa.serviceWorker.additionalPrecachePaths.push(
          requiredItem(candidate.pwa.serviceWorker.additionalPrecachePaths, 0),
        ),
    ],
    [
      "a renamed robots artifact",
      (candidate: MutableSiteContract) => (candidate.discovery.robotsArtifactPath = "crawler.txt"),
    ],
    [
      "a renamed sitemap artifact",
      (candidate: MutableSiteContract) => (candidate.discovery.sitemapArtifactPath = "site-map.xml"),
    ],
    [
      "a canonical URL that differs from the route",
      (candidate: MutableSiteContract) => (candidate.routes.root.url = "https://slithy.net/wrong/"),
    ],
    [
      "an artifact path that differs from the route",
      (candidate: MutableSiteContract) => (candidate.routes.personal.artifactPath = "sasakiuri/home.html"),
    ],
  ])("rejects %s", (_label, mutate) => {
    const candidate = structuredClone(siteContract) as MutableSiteContract;
    mutate(candidate);

    expect(() => siteContractSchema.parse(candidate)).toThrow();
  });
});

type MutableSiteContract = {
  -readonly [Key in keyof typeof siteContract]: Mutable<(typeof siteContract)[Key]>;
};

type Mutable<Value> = Value extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : Value extends object
    ? { -readonly [Key in keyof Value]: Mutable<Value[Key]> }
    : Value;

function requiredItem<Value>(values: readonly Value[], index: number): Value {
  const value = values[index];
  if (value === undefined) throw new TypeError(`Missing fixture item ${index}.`);
  return value;
}
