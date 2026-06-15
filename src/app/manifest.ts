import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WhatsOrder",
    short_name: "WhatsOrder",
    description: "Structured WhatsApp ordering for UAE restaurants.",
    start_url: "/",
    display: "standalone",
    background_color: "#fbfaf7",
    theme_color: "#1f8a5b",
    icons: [
      {
        src: "/icons/icon.svg",
        sizes: "192x192",
        type: "image/svg+xml"
      }
    ]
  };
}
