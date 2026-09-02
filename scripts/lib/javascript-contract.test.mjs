import { describe, expect, it } from "vitest";

import { findNavigatorCapabilityReferences } from "./javascript-contract.mjs";

describe("inline JavaScript contract parser", () => {
  it.each([
    ['navigator.serviceWorker.register("/sw.js");', true],
    ['const sw = navigator.serviceWorker; sw.register("/other.js");', true],
    ['navigator.serviceWorker["reg" + "\u0069ster"]("/other.js");', true],
    ['const { register } = navigator.serviceWorker; register.call(navigator.serviceWorker, "/other.js");', true],
    ['globalThis["navig" + "\u0061tor"].serviceWorker.register("/other.js");', true],
    ['self.__next_f.push([1, "navigator.serviceWorker.register(\\"/sw.js\\")"]);', false],
    ['console.log("serviceWorker.register");', false],
  ])("finds executable navigator capability access in %s", (source, expected) => {
    expect(findNavigatorCapabilityReferences(source).length > 0).toBe(expected);
  });

  it("fails closed for malformed executable JavaScript", () => {
    expect(() => findNavigatorCapabilityReferences("navigator.serviceWorker.register(")).toThrow(
      /Inline JavaScript is invalid/u,
    );
  });
});
