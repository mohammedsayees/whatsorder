import type { NextConfig } from "next";

function configuredSupabaseHost() {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return url.protocol === "https:" ? url.hostname : null;
  } catch {
    return null;
  }
}

const supabaseHost = configuredSupabaseHost();
const supabaseHttpsOrigin = supabaseHost ? `https://${supabaseHost}` : "";
const supabaseWssOrigin = supabaseHost ? `wss://${supabaseHost}` : "";
const scriptPolicy =
  process.env.NODE_ENV === "development"
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  scriptPolicy,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  `connect-src 'self' ${supabaseHttpsOrigin} ${supabaseWssOrigin}`.trim(),
  "worker-src 'self' blob: https://unpkg.com",
  "manifest-src 'self'",
  ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests"] : [])
].join("; ");

const nextConfig: NextConfig = {
  // A separate lockfile exists above this repository on local machines. Keep
  // server output tracing scoped to WhatsOrder so deploy artifacts do not scan
  // or include unrelated files from the parent directory.
  outputFileTracingRoot: process.cwd(),
  // Native Rust addon — must load via require at runtime, not be bundled.
  serverExternalPackages: ["@resvg/resvg-js"],
  // Poster Studio reads its font files (assets/fonts/*.woff) at runtime; the
  // tracer can't see fs reads, so include them for the render route.
  outputFileTracingIncludes: {
    "/api/poster/generate": ["./assets/fonts/*.woff"]
  },
  images: {
    // Only the configured Supabase project can use the image optimizer.
    // Admin-entered external image URLs remain supported as unoptimized images.
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost }]
      : []
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self)"
          }
        ]
      }
    ];
  }
};

export default nextConfig;
