import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME } from "./site-metadata";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#F8FAFC",
    theme_color: "#0B1F3B",
    icons: [
      {
        src: "/brand/jobmiter-mark.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      { src: "/icon", sizes: "512x512", type: "image/png" },
    ],
  };
}
