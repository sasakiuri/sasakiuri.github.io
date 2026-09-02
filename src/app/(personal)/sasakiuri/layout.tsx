import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { ServiceWorkerRegistration } from "@/app/service-worker-registration";
import { StructuredData } from "@/components/structured-data/structured-data";
import { siteConfig } from "@/config/site";

import "../../globals.css";

const socialImage = {
  alt: "SASAKI URI — 梶ヶ谷 宜之のホームページ",
  height: 630,
  url: "/sasakiuri/opengraph-image.png",
  width: 1_200,
} as const;

export const metadata: Metadata = {
  alternates: {
    canonical: "/sasakiuri/",
  },
  applicationName: siteConfig.name,
  authors: [{ name: siteConfig.name, url: siteConfig.url }],
  category: "personal website",
  creator: siteConfig.name,
  description: siteConfig.description,
  formatDetection: {
    address: false,
    email: false,
    telephone: false,
  },
  icons: {
    apple: [{ sizes: "180x180", type: "image/png", url: "/sasakiuri/apple-touch-icon.png" }],
    icon: "/sasakiuri/favicon.ico",
  },
  keywords: ["梶ヶ谷宜之", "sasakiuri", "personal website", "web development"],
  manifest: "/sasakiuri/manifest.webmanifest",
  metadataBase: new URL(new URL(siteConfig.url).origin),
  openGraph: {
    description: siteConfig.description,
    images: [socialImage],
    locale: "ja_JP",
    siteName: siteConfig.name,
    title: siteConfig.title,
    type: "website",
    url: "/sasakiuri/",
  },
  publisher: siteConfig.name,
  referrer: "strict-origin-when-cross-origin",
  robots: {
    follow: true,
    index: true,
  },
  title: siteConfig.title,
  twitter: {
    card: "summary_large_image",
    creator: "@sasakiuri",
    description: siteConfig.description,
    images: [socialImage],
    title: siteConfig.title,
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  initialScale: 1,
  themeColor: "#ffffff",
  width: "device-width",
};

interface RootLayoutProps {
  readonly children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang={siteConfig.language}>
      <body>
        <StructuredData />
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
