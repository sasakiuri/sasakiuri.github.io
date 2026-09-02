import { describe, expect, it } from "vitest";

import { diaryAtomFeedLimit } from "@/lib/diary-atom-feed";

import { GET } from "./route";

describe("diary Atom feed route", () => {
  it("publishes a bounded static feed without source links", async () => {
    const response = GET();
    const feed = await response.text();

    expect(response.headers.get("content-type")).toBe("application/atom+xml; charset=utf-8");
    expect(feed.match(/<entry>/gu)).toHaveLength(diaryAtomFeedLimit);
    expect(feed).toContain("https://slithy.net/sasakuri/diary/2026/#entry-");
    expect(feed).not.toContain("https://x.com");
  });
});
