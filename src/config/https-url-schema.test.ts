import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  canonicalDirectoryUrlSchema,
  createHttpsUrlSchema,
  httpsOriginSchema,
  safeExternalHttpsUrlSchema,
} from "./https-url-schema";

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

  it("distinguishes origins, canonical directories, and safe external URLs", () => {
    expect(httpsOriginSchema.parse("https://example.com")).toBe("https://example.com");
    expect(canonicalDirectoryUrlSchema.parse("https://example.com/path/")).toBe("https://example.com/path/");
    expect(safeExternalHttpsUrlSchema.parse("https://example.com/path?query=yes#fragment")).toBe(
      "https://example.com/path?query=yes#fragment",
    );

    expect(() => httpsOriginSchema.parse("https://example.com/path/")).toThrow();
    expect(() => safeExternalHttpsUrlSchema.parse("https://user:secret@example.com/path")).toThrow();
  });

  it.each([
    "https://user@example.com/",
    "https://:secret@example.com/",
    "https://example.com/?query=yes",
    "https://example.com/#fragment",
    "https://example.com/file",
    "https://example.com:443/",
  ])("rejects non-canonical directory URL %s", (value) => {
    expect(() => canonicalDirectoryUrlSchema.parse(value)).toThrow();
  });
});
