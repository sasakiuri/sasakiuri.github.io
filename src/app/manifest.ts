import type { MetadataRoute } from "next";

import { siteConfig } from "@/config/site";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#ffffff",
    categories: ["personalization", "productivity"],
    description: siteConfig.description,
    display: "standalone",
    id: "/",
    icons: [
      {
        purpose: "any",
        sizes: "192x192",
        src: "/icon-192.png",
        type: "image/png",
      },
      {
        purpose: "maskable",
        sizes: "512x512",
        src: "/icon-512.png",
        type: "image/png",
      },
    ],
    lang: siteConfig.language,
    name: siteConfig.title,
    orientation: "any",
    scope: "/",
    short_name: siteConfig.name,
    start_url: "/",
    theme_color: "#ffffff",
  };
}
