import type { MetadataRoute } from "next";

/** Lets SchoolSync be added to a phone's Home Screen (needed for notifications on iPhone). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SchoolSync",
    short_name: "SchoolSync",
    description: "Announcements, results, fees and WhatsApp in one place.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#d3d7de",
    theme_color: "#131a2c",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
