import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DiaryPage } from "@/components/diary/diary-page";
import { diaryArchivePath, diaryArchiveYears, getDiaryArchivePosts } from "@/content/diary-archive";

export const dynamicParams = false;

interface DiaryArchivePageProps {
  readonly params: Promise<{ readonly year: string }>;
}

export function generateStaticParams() {
  return diaryArchiveYears.map((year) => ({ year }));
}

export async function generateMetadata({ params }: DiaryArchivePageProps): Promise<Metadata> {
  const { year } = await params;
  if (getDiaryArchivePosts(year) === undefined) return {};

  return {
    alternates: {
      canonical: diaryArchivePath(year),
      types: { "application/atom+xml": "/sasakuri/diary/feed.xml" },
    },
    description: `${year}年の日記です。`,
    title: `${year}年の日記`,
  };
}

export default async function Page({ params }: DiaryArchivePageProps) {
  const { year } = await params;
  const posts = getDiaryArchivePosts(year);
  if (posts === undefined) notFound();

  return <DiaryPage archiveYear={year} posts={posts} totalPosts={posts.length} years={diaryArchiveYears} />;
}
