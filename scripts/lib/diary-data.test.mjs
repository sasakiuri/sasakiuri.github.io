import { describe, expect, it } from "vitest";

import {
  createDiaryPost,
  diarySource,
  mergeDiaryPosts,
  publishedAtFromPostId,
  validateDiaryData,
} from "./diary-data.mjs";

const older = createDiaryPost({ id: "2088523830969143604", text: "古い投稿" });
const newer = createDiaryPost({ id: "2093251072781590942", text: "新しい投稿" });

describe("diary data", () => {
  it("derives deterministic timestamps and canonical URLs from X post IDs", () => {
    expect(publishedAtFromPostId(newer.id)).toBe("2026-08-28T08:15:21.132Z");
    expect(newer.url).toBe("https://x.com/sasakiuri/status/2093251072781590942");
  });

  it("merges fresh posts, retains history, and replaces edited text", () => {
    const current = validateDiaryData({ posts: [older], source: { ...diarySource }, version: 1 });
    const edited = createDiaryPost({ id: older.id, text: "編集後" });
    const merged = mergeDiaryPosts(current, [newer, edited]);

    expect(merged.posts).toEqual([newer, edited]);
    expect(Object.isFrozen(merged.posts)).toBe(true);
    expect(Object.isFrozen(merged.posts[0])).toBe(true);
  });

  it("rejects malformed, duplicated, and unsorted archives", () => {
    expect(() => publishedAtFromPostId("invalid")).toThrow(/post ID/u);
    expect(() => validateDiaryData({ posts: [], source: diarySource, version: 1 })).toThrow(/at least one/u);
    expect(() => validateDiaryData({ posts: [older, older], source: { ...diarySource }, version: 1 })).toThrow(
      /duplicated/u,
    );
    expect(() => validateDiaryData({ posts: [older, newer], source: { ...diarySource }, version: 1 })).toThrow(
      /newest first/u,
    );
  });
});
