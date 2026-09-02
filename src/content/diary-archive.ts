import { diaryData } from "./diary";

export type DiaryPost = (typeof diaryData.posts)[number];

export const latestDiaryPostCount = 50;
export const latestDiaryPosts = Object.freeze(diaryData.posts.slice(0, latestDiaryPostCount));

const yearFormatter = new Intl.DateTimeFormat("en", { timeZone: "Asia/Tokyo", year: "numeric" });
const groupedPosts = new Map<string, DiaryPost[]>();
for (const post of diaryData.posts) {
  const year = yearFormatter.format(new Date(post.publishedAt));
  const existing = groupedPosts.get(year);
  if (existing === undefined) groupedPosts.set(year, [post]);
  else existing.push(post);
}
const postsByYear = new Map<string, readonly DiaryPost[]>(
  [...groupedPosts].map(([year, posts]) => [year, Object.freeze(posts)]),
);

export const diaryArchiveYears = Object.freeze([...postsByYear.keys()].sort().reverse());

export function getDiaryArchivePosts(year: string): readonly DiaryPost[] | undefined {
  return postsByYear.get(year);
}

export function diaryArchivePath(year: string): `/sasakuri/diary/${string}/` {
  if (!postsByYear.has(year)) throw new TypeError(`Diary archive year does not exist: ${year}`);
  return `/sasakuri/diary/${year}/`;
}
