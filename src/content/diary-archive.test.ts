import { describe, expect, it } from "vitest";

import {
  diaryArchivePath,
  diaryArchiveYears,
  getDiaryArchivePosts,
  latestDiaryPostCount,
  latestDiaryPosts,
} from "./diary-archive";
import { diaryData } from "./diary";

describe("diary archive", () => {
  it("partitions every post into immutable reverse-chronological years", () => {
    const archivedPosts = diaryArchiveYears.flatMap((year) => getDiaryArchivePosts(year) ?? []);

    expect(archivedPosts).toEqual(diaryData.posts);
    expect(diaryArchiveYears).toEqual(["2026", "2025", "2024", "2023", "2022", "2021", "2020"]);
    expect(getDiaryArchivePosts("2024")?.some(({ id }) => id === "1741490831092293827")).toBe(true);
    expect(getDiaryArchivePosts("2023")?.some(({ id }) => id === "1741490831092293827")).toBe(false);
    expect(Object.isFrozen(diaryArchiveYears)).toBe(true);
    expect(Object.isFrozen(getDiaryArchivePosts("2022"))).toBe(true);
  });

  it("keeps a bounded latest page and rejects nonexistent archive paths", () => {
    expect(latestDiaryPosts).toHaveLength(latestDiaryPostCount);
    expect(latestDiaryPosts).toEqual(diaryData.posts.slice(0, latestDiaryPostCount));
    expect(diaryArchivePath("2022")).toBe("/sasakuri/diary/2022/");
    expect(getDiaryArchivePosts("1900")).toBeUndefined();
    expect(() => diaryArchivePath("1900")).toThrow(/does not exist/u);
  });
});
