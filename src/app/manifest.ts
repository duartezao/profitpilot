import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ProfitPilot",
    short_name: "ProfitPilot",
    description:
      "Gestão e análise de lucro real de múltiplas lojas de dropshipping.",
    start_url: "/",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#7c6bc4",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
