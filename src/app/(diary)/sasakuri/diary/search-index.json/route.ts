import { diaryData } from "@/content/diary";
import type { DiarySearchIndex } from "@/content/diary-types";

export const dynamic = "force-static";

export function GET() {
  const index: DiarySearchIndex = {
    posts: diaryData.posts.map(({ id, publishedAt, text }) => ({ id, publishedAt, text })),
    version: 1,
  };
  return Response.json(index);
}
