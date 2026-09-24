import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./styles.css";
import { PwaRegistration } from "./pwa-registration";

export const metadata: Metadata = {
  title: "Simple Clean Operations",
  description: "Secure Simple Clean staff operations",
  applicationName: "Simple Clean Operations",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/app-icon-v1.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#132d29",
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
