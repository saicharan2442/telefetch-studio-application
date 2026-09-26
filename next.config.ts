import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["telegram"],
  // @ts-ignore
  eslint: {
    ignoreDuringBuilds: true,
  },
  // @ts-ignore
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
