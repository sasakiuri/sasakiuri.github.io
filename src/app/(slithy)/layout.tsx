import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { siteContract } from "@/config/site";

import "./slithy.css";

const { root } = siteContract.routes;

export const metadata: Metadata = {
  alternates: {
    canonical: root.path,
  },
  description: root.description,
  icons: {
    icon: [{ sizes: "16x16", type: "image/x-icon", url: "/favicon.ico" }],
  },
  metadataBase: new URL(siteContract.origin),
  title: root.title,
};

export const viewport: Viewport = {
  initialScale: 1,
  themeColor: "#ffffef",
  width: "device-width",
};

interface RootLayoutProps {
  readonly children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang={root.language}>
      <body>{children}</body>
    </html>
  );
}
