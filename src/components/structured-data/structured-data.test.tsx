import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { siteConfig } from "@/config/site";

import { serializeStructuredData, StructuredData } from "./structured-data";

describe("StructuredData", () => {
  it("publishes a valid ProfilePage without executable markup", () => {
    const { container } = render(<StructuredData />);
    const script = container.querySelector('script[type="application/ld+json"]');

    expect(script).not.toBeNull();
    expect(script?.textContent).not.toContain("<");
    expect(JSON.parse(script?.textContent ?? "")).toEqual(
      expect.objectContaining({
        "@context": "https://schema.org",
        "@type": "ProfilePage",
        mainEntity: expect.objectContaining({
          "@id": "https://slithy.net/sasakiuri/#person",
          "@type": "Person",
          name: siteConfig.name,
          sameAs: siteConfig.socials.map(({ href }) => href),
        }),
      }),
    );
  });

  it("escapes markup delimiters before embedding JSON", () => {
    expect(serializeStructuredData({ value: "</script><script>alert(1)</script>" })).toBe(
      '{"value":"\\u003c/script>\\u003cscript>alert(1)\\u003c/script>"}',
    );
  });
});
