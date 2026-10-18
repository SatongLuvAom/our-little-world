import type { MetadataRoute } from "next";
export const dynamic = "force-static";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Our Little World",
    short_name: "Our World",
    description: "โลกใบเล็กของเราสองคน",
    start_url: "/",
    id: "/",
    scope: "/",
    display: "standalone",
    background_color: "#FFF8F4",
    theme_color: "#FFF8F4",
    lang: "th",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
