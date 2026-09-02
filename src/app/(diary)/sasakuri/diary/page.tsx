import { DiaryPage } from "@/components/diary/diary-page";
import { diaryArchiveYears, latestDiaryPosts } from "@/content/diary-archive";
import { diaryData } from "@/content/diary";

export default function Page() {
  return <DiaryPage posts={latestDiaryPosts} totalPosts={diaryData.posts.length} years={diaryArchiveYears} />;
}
