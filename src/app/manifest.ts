import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Asistente ITSM Forum",
    short_name: "Forum ITSM",
    description: "Asistente instalable para soporte y tickets del ITSM Forum.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#F4F7F8",
    theme_color: "#004481",
    orientation: "any",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
