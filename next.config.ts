import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["telegram"],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
