import { diaryData } from "@/content/diary";
import { createDiaryTextArchive } from "@/lib/diary-text-archive";

export const dynamic = "force-static";

export function GET() {
  const archive = createDiaryTextArchive(
    diaryData.posts.map(({ id, publishedAt, text }) => ({ id, publishedAt, text })),
  );
  return new Response(archive, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
