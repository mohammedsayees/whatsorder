import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("public job discovery", () => {
  it("publishes canonical, social, and structured JobPosting metadata", () => {
    const page = source("src/app/jobs/[jobId]/page.tsx");
    expect(page).toContain("buildJobPostingSchema");
    expect(page).toContain('type="application/ld+json"');
    expect(page).toContain("alternates: { canonical: url }");
    expect(page).toContain('card: "summary_large_image"');
    expect(source("src/app/jobs/[jobId]/opengraph-image.tsx")).toContain(
      "ImageResponse"
    );
  });

  it("exposes active jobs through sitemap and robots metadata routes", () => {
    const sitemap = source("src/app/sitemap.ts");
    const robots = source("src/app/robots.ts");
    const actions = source("src/app/admin/jobs/actions.ts");
    expect(sitemap).toContain("getPublicJobs");
    expect(sitemap).toContain("/jobs/${job.id}");
    expect(robots).toContain('allow: ["/", "/jobs", "/jobs/"]');
    expect(robots).toContain("/sitemap.xml");
    expect(actions).toContain('revalidatePath("/sitemap.xml")');
  });

  it("gives employers and candidates direct job-discovery actions", () => {
    const adminShare = source("src/components/admin/CopyJobLinkButton.tsx");
    const publicJobs = source("src/app/jobs/page.tsx");
    const landing = source("src/app/page.tsx");
    const menu = source("src/components/customer/RestaurantMenu.tsx");
    expect(adminShare).toContain("Share on WhatsApp");
    expect(adminShare).toContain("buildWhatsAppJobShareUrl");
    expect(publicJobs).toContain("Request matching job alerts");
    expect(landing).toContain('href="/jobs"');
    expect(menu).toContain('href="/jobs"');
  });
});
