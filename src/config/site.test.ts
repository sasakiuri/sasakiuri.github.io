import { describe, expect, it } from "vitest";

import { siteConfig, siteConfigSchema } from "./site";

describe("siteConfig", () => {
  it("matches the runtime schema", () => {
    expect(siteConfigSchema.parse(siteConfig)).toEqual(siteConfig);
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
