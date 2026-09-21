import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./styles.css";
import { PwaRegistration } from "./pwa-registration";

export const metadata: Metadata = {
  title: "Simply Clean Operations",
  description: "Secure Simply Clean staff operations",
  applicationName: "Simply Clean Operations",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/app-icon-v1.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#176b55",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <PwaRegistration />
      </body>
    </html>
  );
}
