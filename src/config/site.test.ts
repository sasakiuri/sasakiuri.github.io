import { describe, expect, it } from "vitest";

import { siteConfig, siteConfigSchema } from "./site";

describe("siteConfig", () => {
  it("matches the runtime schema and is deeply immutable", () => {
    expect(siteConfigSchema.parse(siteConfig)).toEqual(siteConfig);
    expect(Object.isFrozen(siteConfig)).toBe(true);
    expect(Object.isFrozen(siteConfig.hero)).toBe(true);
    expect(Object.isFrozen(siteConfig.hero.image)).toBe(true);
    expect(Object.isFrozen(siteConfig.socials)).toBe(true);
    expect(Object.isFrozen(siteConfig.socials[0])).toBe(true);
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
});
