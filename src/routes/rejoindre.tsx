import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { keepInvite } from "@/lib/hub";

/** Lien d'invitation : garde le code le temps de se connecter, puis mène au hub. */
export const Route = createFileRoute("/rejoindre")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) =>
    typeof search["code"] === "string" ? { code: search["code"] } : {},
  head: () => ({ meta: [{ title: "Rejoindre une table" }] }),
  component: Join,
});

function Join() {
  const { code } = Route.useSearch();
  const navigate = useNavigate();
  useEffect(() => {
    if (code) keepInvite(code);
    void navigate({ to: "/", replace: true });
  }, [code, navigate]);
  return <main />;
}
