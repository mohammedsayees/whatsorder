import { ImageResponse } from "next/og";
import { getPublicJob } from "@/lib/jobs-data";

export const alt = "WhatsOrder hospitality job vacancy";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function JobOpenGraphImage({
  params
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const job = await getPublicJob(jobId);

  return new ImageResponse(
    <div
      style={{
        alignItems: "stretch",
        background: "#f6f7f5",
        color: "#17201b",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        justifyContent: "space-between",
        padding: "64px 72px",
        width: "100%"
      }}
    >
      <div style={{ color: "#1f8a5b", display: "flex", fontSize: 30, fontWeight: 800 }}>
        WhatsOrder Jobs
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", fontSize: 66, fontWeight: 900, lineHeight: 1.05 }}>
          {job?.title ?? "Hospitality job opportunity"}
        </div>
        <div style={{ color: "#59625d", display: "flex", fontSize: 34 }}>
          {job ? `${job.city}, ${job.emirate}` : "United Arab Emirates"}
        </div>
      </div>
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
        <div style={{ display: "flex", fontSize: 28, fontWeight: 700 }}>
          {job?.restaurant_name ?? "Restaurant hiring via WhatsOrder"}
        </div>
        <div style={{ background: "#25D366", borderRadius: 999, color: "#073b24", display: "flex", fontSize: 24, fontWeight: 800, padding: "16px 28px" }}>
          Apply on WhatsApp
        </div>
      </div>
    </div>,
    size
  );
}
