import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { StructuredData } from "@/components/structured-data/structured-data";
import { siteConfig } from "@/config/site";

import { ServiceWorkerRegistration } from "./service-worker-registration";

import "./globals.css";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
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
    apple: [{ sizes: "180x180", type: "image/png", url: "/apple-touch-icon.png" }],
    icon: "/favicon.ico",
  },
  keywords: ["梶ヶ谷宜之", "sasakiuri", "personal website", "web development"],
  manifest: "/manifest.webmanifest",
  metadataBase: new URL(siteConfig.url),
  openGraph: {
    description: siteConfig.description,
    locale: "ja_JP",
    siteName: siteConfig.name,
    title: siteConfig.title,
    type: "website",
    url: "/",
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
