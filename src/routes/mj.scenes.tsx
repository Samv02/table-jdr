import { createFileRoute } from "@tanstack/react-router";
import { SceneManager } from "@/components/SceneManager";

export const Route = createFileRoute("/mj/scenes")({
  ssr: false,
  head: () => ({ meta: [{ title: "Scènes" }] }),
  component: () => (
    <main>
      <div className="wrap">
        <SceneManager />
      </div>
    </main>
  ),
});
