import type { MetadataRoute } from "next";

import { siteContract } from "@/config/site";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      allow: "/",
      userAgent: "*",
    },
    sitemap: new URL(`/${siteContract.discovery.sitemapArtifactPath}`, `${siteContract.origin}/`).href,
  };
}
