import { describe, expect, it } from "vitest";

import { diaryData } from "@/content/diary";

import { GET } from "./route";

describe("diary search index route", () => {
  it("publishes only searchable fields for every archived post", async () => {
    const response = GET();
    const index = await response.json();

    expect(response.headers.get("content-type")).toContain("application/json");
    expect(index).toEqual({
      posts: diaryData.posts.map(({ id, publishedAt, text }) => ({ id, publishedAt, text })),
      version: 1,
    });
    expect(Object.keys(index.posts[0])).toEqual(["id", "publishedAt", "text"]);
  });
});
