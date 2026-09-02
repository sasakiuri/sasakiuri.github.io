import { describe, expect, it } from "vitest";

import type { DiarySearchPost } from "@/content/diary-types";

import {
  createDiaryTextArchive,
  diaryJsonArchiveFilename,
  diaryTextArchiveFilename,
  diaryTextArchivePath,
} from "./diary-text-archive";

const posts: readonly DiarySearchPost[] = [
  { id: "1000001", publishedAt: "2025-01-01T00:00:00.000Z", text: "新しい日記" },
  { id: "1000000", publishedAt: "2024-01-01T00:00:00.000Z", text: "古い日記" },
];

describe("diary text archive", () => {
  it("exports newest-first plain text without IDs or source links", () => {
    const archive = createDiaryTextArchive([...posts].reverse());

    expect(diaryTextArchivePath).toBe("/sasakuri/diary/archive.txt");
    expect(diaryTextArchiveFilename).toBe("sasakiuri-diary.txt");
    expect(diaryJsonArchiveFilename).toBe("sasakiuri-diary.json");
    expect(archive).toContain("ささきうりの日記\n2件");
    expect(archive.indexOf("新しい日記")).toBeLessThan(archive.indexOf("古い日記"));
    expect(archive).not.toContain("1000001");
    expect(archive).not.toContain("x.com");
  });

  it("rejects an empty archive", () => {
    expect(() => createDiaryTextArchive([])).toThrow(/at least one post/u);
  });
});
