import { describe, expect, it } from "vitest";

import { createHttpsUrlSchema } from "./https-url-schema";

describe("httpsUrlSchema", () => {
  it.each(["http://example.com", "httpsx://example.com", "xhttps://example.com"])("rejects %s", (value) => {
    expect(() => createHttpsUrlSchema().parse(value)).toThrow();
  });

  it("accepts an HTTPS URL", () => {
    expect(createHttpsUrlSchema().parse("https://example.com")).toBe("https://example.com");
  });
});
