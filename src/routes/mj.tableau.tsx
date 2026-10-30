import { createFileRoute } from "@tanstack/react-router";
import { GmDashboard } from "@/components/GmDashboard";
export const Route = createFileRoute("/mj/tableau")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Tableau de bord MJ" },
      {
        name: "description",
        content:
          "Les fiches du groupe en direct : vitaux, caractéristiques, compétences, combat et inventaire.",
      },
      { property: "og:title", content: "Tableau de bord MJ" },
      { property: "og:description", content: "Supervision en direct des personnages de la table." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GmDashboard,
});
