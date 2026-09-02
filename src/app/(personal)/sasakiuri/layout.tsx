import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { ServiceWorkerRegistration } from "@/app/service-worker-registration";
import { StructuredData } from "@/components/structured-data/structured-data";
import { siteConfig, siteContract } from "@/config/site";

import "../../globals.css";

const socialImage = {
  alt: siteConfig.socialImage.alt,
  height: siteConfig.socialImage.height,
  url: siteConfig.socialImage.src,
  width: siteConfig.socialImage.width,
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
    apple: [
      {
        sizes: siteConfig.appleTouchIcon.sizes,
        type: siteConfig.appleTouchIcon.type,
        url: siteConfig.appleTouchIcon.src,
      },
    ],
    icon: {
      type: siteConfig.favicon.type,
      url: siteConfig.favicon.src,
    },
  },
  keywords: ["梶ヶ谷宜之", "sasakiuri", "personal website", "web development"],
  manifest: siteContract.pwa.manifest.publicPath,
  metadataBase: new URL(siteContract.origin),
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
        <ServiceWorkerRegistration
          scope={siteContract.pwa.serviceWorker.scope}
          scriptUrl={siteContract.pwa.serviceWorker.publicPath}
        />
      </body>
    </html>
  );
}
