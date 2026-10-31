import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { UniverseEditor } from "@/components/UniverseEditor";

export const Route = createFileRoute("/mj/univers")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) =>
    typeof search["page"] === "string" ? { page: search["page"] } : {},
  head: () => ({ meta: [{ title: "Univers" }] }),
  component: UniversePage,
});

function UniversePage() {
  const { page } = Route.useSearch();
  const navigate = useNavigate({ from: "/mj/univers" });
  return (
    <main>
      <div className="wrap">
        <header className="page-head">
          <h1>Univers</h1>
          <p>Les règles et l’ambiance de ta table. Rien n’est envoyé avant d’enregistrer.</p>
        </header>
        <UniverseEditor page={page} onPage={(next) => void navigate({ search: { page: next } })} />
      </div>
    </main>
  );
}
