import type { NextConfig } from "next";

const nextConfig = {
  images: {
    unoptimized: true,
  },
  output: "export",
  poweredByHeader: false,
  reactCompiler: true,
  reactStrictMode: true,
  trailingSlash: true,
  typedRoutes: true,
} satisfies NextConfig;

export default nextConfig;
