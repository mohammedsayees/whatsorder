import type { MetadataRoute } from "next";
import { getPublicJobs } from "@/lib/jobs-data";
import { publicAppUrl } from "@/lib/public-app-url";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = publicAppUrl();
  const pageSize = 24;
  const firstPage = await getPublicJobs({ page: 1, pageSize });
  const pageCount = Math.min(42, Math.ceil(firstPage.total / pageSize));
  const remainingPages = await Promise.all(
    Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) =>
      getPublicJobs({ page: index + 2, pageSize })
    )
  );
  const jobs = [firstPage, ...remainingPages].flatMap((page) => page.jobs);

  return [
    { url: baseUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/jobs`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${baseUrl}/jobs/post`, changeFrequency: "monthly", priority: 0.5 },
    ...jobs.map((job) => ({
      url: `${baseUrl}/jobs/${job.id}`,
      lastModified: job.published_at ?? undefined,
      changeFrequency: "daily" as const,
      priority: 0.8
    }))
  ];
}
