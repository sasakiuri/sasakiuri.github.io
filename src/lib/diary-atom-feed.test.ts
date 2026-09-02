import { describe, expect, it } from "vitest";

import type { DiarySearchPost } from "@/content/diary-types";

import { createDiaryAtomFeed, diaryAtomFeedLimit, diaryAtomFeedPath } from "./diary-atom-feed";

const post: DiarySearchPost = {
  id: "2093251072781590942",
  publishedAt: "2026-08-28T08:15:21.132Z",
  text: "日記 & <本文> \"引用\" '終'\u0001",
};

describe("diary Atom feed", () => {
  it("publishes escaped text with only canonical local entry links", () => {
    const feed = createDiaryAtomFeed([post]);
    const parsed = new DOMParser().parseFromString(feed, "application/xml");

    expect(diaryAtomFeedPath).toBe("/sasakuri/diary/feed.xml");
    expect(parsed.querySelector("parsererror")).toBeNull();
    expect(parsed.querySelectorAll("entry")).toHaveLength(1);
    expect(feed).toContain('<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="ja">');
    expect(feed).toContain("<name>ささきうり</name>");
    expect(feed).toContain("日記 &amp; &lt;本文&gt; &quot;引用&quot; &apos;終&apos;�");
    expect(feed).toContain("https://slithy.net/sasakuri/diary/2026/#entry-2093251072781590942");
    expect(feed).toContain('rel="self" type="application/atom+xml"');
    expect(feed).not.toContain("x.com");
  });

  it("sorts newest first and limits the published entries", () => {
    const posts = Array.from({ length: diaryAtomFeedLimit + 2 }, (_value, index) => ({
      id: String(1_000_000 + index),
      publishedAt: new Date(Date.UTC(2020, 0, index + 1)).toISOString(),
      text: `日記 ${index}`,
    }));
    const feed = createDiaryAtomFeed(posts);

    expect(feed.match(/<entry>/gu)).toHaveLength(diaryAtomFeedLimit);
    expect(feed.indexOf(`日記 ${diaryAtomFeedLimit + 1}`)).toBeLessThan(feed.indexOf(`日記 2`));
    expect(feed).not.toContain("日記 0</content>");
  });

  it("rejects an empty archive", () => {
    expect(() => createDiaryAtomFeed([])).toThrow(/at least one post/u);
  });
});
