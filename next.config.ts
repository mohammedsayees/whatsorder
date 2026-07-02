import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Only Supabase Storage images go through the optimizer. A wildcard here
    // would make /_next/image an open image proxy. Non-Supabase URLs render
    // with `unoptimized` in the components that allow admin-entered URLs.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co"
      }
    ]
  }
};

export default nextConfig;
