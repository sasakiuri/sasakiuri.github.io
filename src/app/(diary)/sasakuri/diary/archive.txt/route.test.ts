import { describe, expect, it } from "vitest";

import { diaryData } from "@/content/diary";

import { GET } from "./route";

describe("diary text archive route", () => {
  it("publishes every post as plain text without source links", async () => {
    const response = GET();
    const archive = await response.text();

    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(archive).toContain(`${diaryData.posts.length}件`);
    expect(archive).toContain(diaryData.posts[0]?.text);
    expect(archive).not.toContain("https://x.com");
  });
});
