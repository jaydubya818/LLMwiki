import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@second-brain/core"],
  serverExternalPackages: ["pdf-parse", "simple-git"],
};

export default nextConfig;
