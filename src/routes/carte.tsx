import { createFileRoute } from "@tanstack/react-router";
import { MapPage } from "@/components/MapPage";

export const Route = createFileRoute("/carte")({
  ssr: false,
  head: () => ({ meta: [{ title: "Carte" }] }),
  component: MapPage,
});
