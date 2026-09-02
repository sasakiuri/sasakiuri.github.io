import { describe, expect, it } from "vitest";

import type { DiarySearchPost } from "@/content/diary-types";

import {
  diaryPostDate,
  diaryPostYear,
  extractDiaryHighlightTerms,
  filterAndSortDiaryPosts,
  normalizeSearchText,
  prepareDiarySearch,
  searchDiary,
  suggestDiaryQueries,
} from "./diary-search";

const posts: readonly DiarySearchPost[] = [
  { id: "2093251072781590942", publishedAt: "2026-08-28T08:15:21.132Z", text: "タンブラーを床にぶちまけた" },
  { id: "2091486581530206599", publishedAt: "2026-08-23T11:23:53.635Z", text: "狩猟免許を無事更新" },
  { id: "2088523830969143604", publishedAt: "2026-08-15T07:10:58.856Z", text: "t12b34r の記録" },
];
const records = prepareDiarySearch(posts);

describe("diary fuzzy search", () => {
  it("normalizes width, case, and whitespace", () => {
    expect(normalizeSearchText("  \uFF34\uFF25\uFF33\uFF34\n検索  ")).toBe("test 検索");
  });

  it("preserves chronological order for an empty query", () => {
    expect(searchDiary(records, "   ")).toEqual(posts);
  });

  it("finds exact phrases, Japanese dates, and multiple terms", () => {
    expect(searchDiary(records, "タンブラー")).toEqual([posts[0]]);
    expect(searchDiary(records, "2026年8月23日")).toEqual([posts[1]]);
    expect(searchDiary(records, "狩猟 更新")).toEqual([posts[1]]);
  });

  it("tolerates edits and compact subsequences without broad short-query matches", () => {
    expect(searchDiary(records, "タンプラー")).toEqual([posts[0]]);
    expect(searchDiary(records, "tbr")).toEqual([posts[2]]);
    expect(searchDiary(records, "存在しない語")).toEqual([]);
    expect(searchDiary(records, "z")).toEqual([]);
  });

  it("supports quoted phrases, exclusions, and OR groups", () => {
    expect(searchDiary(records, '"狩猟免許"')).toEqual([posts[1]]);
    expect(searchDiary(records, '"狩猟 更新"')).toEqual([]);
    expect(searchDiary(records, '"タンブラー" OR "狩猟免許"')).toEqual([posts[0], posts[1]]);
    expect(searchDiary(records, "タンブラー -床")).toEqual([]);
    expect(searchDiary(records, "-床")).toEqual([posts[1], posts[2]]);
    expect(extractDiaryHighlightTerms('タンブラー OR "狩猟免許" -更新 タンブラー')).toEqual(["タンブラー", "狩猟免許"]);
  });

  it("suggests short search terms instead of diary posts", () => {
    expect(suggestDiaryQueries(posts, "タンプラー")[0]).toBe("タンブラー");
    expect(suggestDiaryQueries(posts, "狩猟")).toContain("狩猟免許");
    expect(suggestDiaryQueries(posts, "床 タンプラー")[0]).toBe("床 タンブラー");
    expect(suggestDiaryQueries(posts, "タンプラー", 2)).toHaveLength(2);
    expect(suggestDiaryQueries(posts, "   ")).toEqual([]);
    expect(suggestDiaryQueries(posts, "タンプラー", 0)).toEqual([]);
    expect(suggestDiaryQueries(posts, '"タンブラー"')).toEqual([]);
    expect(suggestDiaryQueries(posts, "タンブラー OR 狩猟")).toEqual([]);
    expect(suggestDiaryQueries(posts, "タンプラー")).not.toContain(posts[0]?.text);
  });

  it("filters in Japan time and sorts independently from relevance", () => {
    const boundaryPost = {
      id: "1741490831092293827",
      publishedAt: "2023-12-31T15:30:00.000Z",
      text: "年越し",
    };
    const candidates = [...posts, boundaryPost];

    expect(diaryPostYear(boundaryPost)).toBe("2024");
    expect(diaryPostDate(boundaryPost)).toBe("2024-01-01");
    expect(
      filterAndSortDiaryPosts(candidates, {
        dateFrom: "2024-01-01",
        dateTo: "2024-01-01",
        sort: "relevance",
        year: "2024",
      }),
    ).toEqual([boundaryPost]);
    expect(filterAndSortDiaryPosts(posts, { dateFrom: "", dateTo: "", sort: "newest", year: "all" })).toEqual(posts);
    expect(filterAndSortDiaryPosts(posts, { dateFrom: "", dateTo: "", sort: "oldest", year: "all" })).toEqual(
      [...posts].reverse(),
    );
    expect(
      filterAndSortDiaryPosts(posts, {
        dateFrom: "2026-08-16",
        dateTo: "2026-08-27",
        sort: "relevance",
        year: "all",
      }),
    ).toEqual([posts[1]]);
  });
});
