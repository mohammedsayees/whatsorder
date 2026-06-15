import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WhatsOrder",
  description: "Structured WhatsApp ordering for small UAE restaurants.",
  applicationName: "WhatsOrder",
  appleWebApp: {
    capable: true,
    title: "WhatsOrder",
    statusBarStyle: "default"
  }
};

export const viewport: Viewport = {
  themeColor: "#1f8a5b",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
