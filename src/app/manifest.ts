import type { MetadataRoute } from "next";

import { siteConfig } from "@/config/site";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#ffffff",
    description: siteConfig.description,
    display: "standalone",
    icons: [
      {
        sizes: "16x16 32x32 48x48",
        src: "/favicon.ico",
        type: "image/x-icon",
      },
    ],
    lang: siteConfig.language,
    name: siteConfig.title,
    short_name: siteConfig.name,
    start_url: "/",
    theme_color: "#ffffff",
  };
}
