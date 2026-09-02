import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./slithy.css";

const siteUrl = "https://slithy.net";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [{ sizes: "16x16", type: "image/x-icon", url: "/favicon.ico" }],
  },
  metadataBase: new URL(siteUrl),
  title: "SLITHY.NET",
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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
