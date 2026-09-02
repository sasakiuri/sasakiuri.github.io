import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { diaryConfig, siteContract } from "@/config/site";

import "../globals.css";

export const metadata: Metadata = {
  alternates: {
    canonical: diaryConfig.path,
    types: { "application/atom+xml": "/sasakuri/diary/feed.xml" },
  },
  description: diaryConfig.description,
  metadataBase: new URL(siteContract.origin),
  robots: {
    follow: true,
    index: true,
  },
  title: diaryConfig.title,
};

export const viewport: Viewport = {
  colorScheme: "light",
  initialScale: 1,
  themeColor: siteContract.pwa.manifest.themeColor,
  width: "device-width",
};

interface DiaryLayoutProps {
  readonly children: ReactNode;
}

export default function DiaryLayout({ children }: DiaryLayoutProps) {
  return (
    <html lang={diaryConfig.language}>
      <body>{children}</body>
    </html>
  );
}
