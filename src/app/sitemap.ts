import type { MetadataRoute } from "next";

import { siteContract } from "@/config/site";
import { diaryData } from "@/content/diary";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const { diary, personal, root } = siteContract.routes;
  const latestPost = diaryData.posts.at(0);
  if (latestPost === undefined) throw new TypeError("Diary must contain at least one post.");

  return [
    {
      changeFrequency: "yearly",
      priority: 1,
      url: root.url,
    },
    {
      changeFrequency: "yearly",
      priority: 0.8,
      url: personal.url,
    },
    {
      changeFrequency: "daily",
      lastModified: latestPost.publishedAt,
      priority: 0.6,
      url: diary.url,
    },
  ];
}
