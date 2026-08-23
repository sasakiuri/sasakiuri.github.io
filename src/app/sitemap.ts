import type { MetadataRoute } from "next";

import { siteConfig } from "@/config/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      changeFrequency: "yearly",
      priority: 1,
      url: siteConfig.url,
    },
  ];
}
