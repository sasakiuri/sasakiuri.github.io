import { diaryConfig } from "@/config/site";
import type { DiarySearchPost } from "@/content/diary-types";

export const diaryTextArchivePath = "/sasakuri/diary/archive.txt";
export const diaryTextArchiveFilename = "sasakiuri-diary.txt";
export const diaryJsonArchiveFilename = "sasakiuri-diary.json";

const entryDateFormatter = new Intl.DateTimeFormat("ja-JP", {
  day: "numeric",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "long",
  timeZone: "Asia/Tokyo",
  weekday: "short",
  year: "numeric",
});

export function createDiaryTextArchive(posts: readonly DiarySearchPost[]): string {
  if (posts.length === 0) throw new TypeError("The diary text archive requires at least one post.");

  const entries = [...posts]
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))
    .map((post) => `${entryDateFormatter.format(new Date(post.publishedAt))}\n${post.text}`);
  return `${diaryConfig.title}\n${entries.length}件\n\n${entries.join("\n\n-----\n\n")}\n`;
}
