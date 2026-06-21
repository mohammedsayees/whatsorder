import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Explicitly disable Turbopack — Next.js 16 defaults to Turbopack for production
  // builds but its 16.2.9 release has a bug that breaks client references in the
  // admin server bundle, causing ReferenceError at runtime on every server action.
  turbopack: false as unknown as object,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**"
      }
    ]
  }
};

export default nextConfig;
