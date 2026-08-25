import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createHttpsUrlSchema } from "./https-url-schema";

describe("httpsUrlSchema", () => {
  it.each(["http://example.com", "httpsx://example.com", "xhttps://example.com", "HTTPS://example.com"])(
    "rejects %s",
    (value) => {
      expect(() => createHttpsUrlSchema().parse(value)).toThrow();
    },
  );

  it("accepts arbitrary valid HTTPS URLs as a branded value", () => {
    fc.assert(
      fc.property(fc.webUrl({ validSchemes: ["https"], withFragments: true, withQueryParameters: true }), (url) => {
        expect(createHttpsUrlSchema().parse(url)).toBe(url);
      }),
    );
  });

  it("rejects arbitrary valid URLs using other schemes", () => {
    fc.assert(
      fc.property(fc.webUrl({ validSchemes: ["ftp", "http", "ws"] }), (url) => {
        expect(() => createHttpsUrlSchema().parse(url)).toThrow();
      }),
    );
  });
});
