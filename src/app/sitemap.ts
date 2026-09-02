import type { MetadataRoute } from "next";

import { siteConfig } from "@/config/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteOrigin = new URL(siteConfig.url).origin;

  return [
    {
      changeFrequency: "yearly",
      priority: 1,
      url: `${siteOrigin}/`,
    },
    {
      changeFrequency: "yearly",
      priority: 0.8,
      url: siteConfig.url,
    },
  ];
}
