import type { MetadataRoute } from "next";
import { publicAppUrl } from "@/lib/public-app-url";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = publicAppUrl();
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/jobs", "/jobs/"],
      disallow: ["/admin/", "/api/", "/auth/", "/select-restaurant", "/super-admin/"]
    },
    sitemap: `${baseUrl}/sitemap.xml`
  };
}
