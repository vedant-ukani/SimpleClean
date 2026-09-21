import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Simply Clean Operations",
    short_name: "Simply Clean",
    description: "Secure Simply Clean staff operations",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7f4eb",
    theme_color: "#176b55",
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
