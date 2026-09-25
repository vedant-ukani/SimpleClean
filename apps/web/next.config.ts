import type { NextConfig } from "next";

import { parseWebServerEnvironment } from "@laundrorama/config";

const nextConfig: NextConfig = {
  agentRules: false,
  output: "standalone",
  transpilePackages: ["@laundrorama/config", "@laundrorama/contracts"],
  async rewrites() {
    const { apiBaseUrl } = parseWebServerEnvironment(process.env);
    return [
      {
        source: "/api/:path*",
        destination: `${apiBaseUrl.replace(/\/$/, "")}/:path*`,
      },
    ];
  },
};

export default nextConfig;
