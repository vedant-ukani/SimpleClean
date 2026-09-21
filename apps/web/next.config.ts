import type { NextConfig } from "next";

import { parseWebServerEnvironment } from "@simply-clean/config";

const nextConfig: NextConfig = {
  agentRules: false,
  output: "standalone",
  transpilePackages: ["@simply-clean/config", "@simply-clean/contracts"],
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
