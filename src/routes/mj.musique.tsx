import { createFileRoute } from "@tanstack/react-router";
import { MusicManager } from "@/components/TableMusic";

export const Route = createFileRoute("/mj/musique")({
  ssr: false,
  head: () => ({ meta: [{ title: "Musique" }] }),
  component: () => (
    <main>
      <div className="wrap">
        <MusicManager />
      </div>
    </main>
  ),
});
