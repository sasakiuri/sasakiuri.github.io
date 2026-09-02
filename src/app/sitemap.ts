import type { MetadataRoute } from "next";

import { siteContract } from "@/config/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const { personal, root } = siteContract.routes;

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
  ];
}
