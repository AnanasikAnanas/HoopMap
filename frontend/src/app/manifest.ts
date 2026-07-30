import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "HOOPMAP — баскетбол рядом",
    short_name: "HOOPMAP",
    description: "Баскетбольные площадки и открытые игры рядом с вами",
    start_url: "/map?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#181c21",
    theme_color: "#f26a2e",
    categories: ["sports", "social", "navigation"],
    lang: "ru",
    icons: [
      {
        src: "/icons/hoopmap-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/hoopmap-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/hoopmap-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
