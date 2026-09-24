import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Simple Clean Operations",
    short_name: "Simple Clean",
    description: "Secure Simple Clean staff operations",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f5f7f6",
    theme_color: "#132d29",
    orientation: "any",
    icons: [
      {
        src: "/icons/app-icon-v1.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/app-maskable-v1.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
