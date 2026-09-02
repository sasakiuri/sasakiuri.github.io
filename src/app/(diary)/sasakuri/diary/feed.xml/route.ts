import { diaryData } from "@/content/diary";
import { createDiaryAtomFeed } from "@/lib/diary-atom-feed";

export const dynamic = "force-static";

export function GET() {
  const feed = createDiaryAtomFeed(diaryData.posts.map(({ id, publishedAt, text }) => ({ id, publishedAt, text })));
  return new Response(feed, {
    headers: { "content-type": "application/atom+xml; charset=utf-8" },
  });
}
