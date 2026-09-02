import { describe, expect, it } from "vitest";

import { validateDiarySearchIndex } from "./diary-search-index";

const newer = { id: "2093251072781590942", publishedAt: "2026-08-28T08:15:21.132Z", text: "新しい日記" };
const older = { id: "2088523830969143604", publishedAt: "2026-08-15T07:10:58.856Z", text: "古い日記" };

describe("diary search index", () => {
  it("accepts and freezes a minimal exact index", () => {
    const index = validateDiarySearchIndex({ posts: [newer, older], version: 1 }, 2);

    expect(index.posts).toEqual([newer, older]);
    expect(Object.isFrozen(index)).toBe(true);
    expect(Object.isFrozen(index.posts)).toBe(true);
    expect(Object.isFrozen(index.posts[0])).toBe(true);
  });

  it.each([
    ["a non-object", null, 2, /must be an object/u],
    ["unknown fields", { posts: [newer, older], version: 1, source: "X" }, 2, /unknown properties/u],
    ["the wrong version", { posts: [newer, older], version: 2 }, 2, /version/u],
    ["an invalid expected count", { posts: [newer, older], version: 1 }, 0, /post count/u],
    ["a mismatched count", { posts: [newer], version: 1 }, 2, /post count/u],
    ["unknown post fields", { posts: [{ ...newer, url: "https://example.com" }], version: 1 }, 1, /unknown/u],
    ["an invalid ID", { posts: [{ ...newer, id: "invalid" }], version: 1 }, 1, /invalid ID/u],
    ["duplicate IDs", { posts: [newer, newer], version: 1 }, 2, /duplicated/u],
    ["oldest-first posts", { posts: [older, newer], version: 1 }, 2, /newest first/u],
    ["an invalid timestamp", { posts: [{ ...newer, publishedAt: "today" }], version: 1 }, 1, /ISO/u],
    ["non-string text", { posts: [{ ...newer, text: 1 }], version: 1 }, 1, /invalid text/u],
    ["unnormalized text", { posts: [{ ...newer, text: " 新しい日記 " }], version: 1 }, 1, /invalid text/u],
  ])("rejects %s", (_label, value, expectedPosts, message) => {
    expect(() => validateDiarySearchIndex(value, expectedPosts)).toThrow(message);
  });
});
