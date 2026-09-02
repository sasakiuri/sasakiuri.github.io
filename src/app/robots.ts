import type { MetadataRoute } from "next";

import { siteConfig } from "@/config/site";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  const siteOrigin = new URL(siteConfig.url).origin;

  return {
    rules: {
      allow: "/",
      userAgent: "*",
    },
    sitemap: `${siteOrigin}/sitemap.xml`,
  };
}
