import { describe, expect, test } from "vitest";

import { containsXUrl } from "./url-policy.mjs";

describe("containsXUrl", () => {
  test.each([
    "https://x.com/sasakiuri/status/1",
    "prefix https://mobile.x.com/sasakiuri/status/1 suffix",
    '<link href="https://x.com/sasakiuri/status/1" />',
  ])("detects an X URL in %s", (text) => {
    expect(containsXUrl(text)).toBe(true);
  });

  test.each([
    "https://example.com/https://x.com/sasakiuri",
    "https://x.com.example.com/sasakiuri",
    "https://notx.com/sasakiuri",
    "https://x.com@example.com/sasakiuri",
    "plain text containing x.com",
  ])("does not mistake another host for X in %s", (text) => {
    expect(containsXUrl(text)).toBe(false);
  });

  test("rejects a non-string input", () => {
    expect(() => containsXUrl(undefined)).toThrow(new TypeError("URL source must be a string."));
  });
});
