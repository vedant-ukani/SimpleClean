import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  output: "standalone",
  transpilePackages: ["@simply-clean/config", "@simply-clean/contracts"],
};

export default nextConfig;
