import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DoorOpen, LogIn, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/InlineError";
import { confirmAction } from "@/components/ConfirmDialog";
import { openTeam } from "@/lib/team";
import { loginDestination } from "@/lib/dashboard";

export const Route = createFileRoute("/equipes")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Mes équipes" },
      { name: "description", content: "Crée une équipe ou rejoins-en une avec un code." },
    ],
  }),
  component: TeamsPage,
});

type MyTeam = { id: string; name: string; role: string; members: number; active: boolean };

function TeamsPage() {
  const [teams, setTeams] = useState<MyTeam[] | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data, error } = await supabase.rpc("my_teams");
    if (error) return void setErr(error.message);
    setTeams(data ?? []);
  }
  useEffect(() => void load(), []);

  async function open(t: MyTeam) {
    const error = await openTeam(t.id, loginDestination(t.role === "gm"));
    if (error) setErr(error);
  }
  async function create() {
    if (busy) return;
    setBusy(true);
    const { error } = await supabase.rpc("create_team", { _name: name });
    setBusy(false);
    if (error) return void setErr(error.message);
    window.location.assign(loginDestination(true));
  }
  async function join() {
    if (busy) return;
    setBusy(true);
    const { error } = await supabase.rpc("join_team", { _code: code });
    setBusy(false);
    if (error) return void setErr(error.message);
    window.location.assign(loginDestination(false));
  }
  async function leave(t: MyTeam) {
    const ok = await confirmAction({
      title: `Quitter « ${t.name} » ?`,
      message:
        "Tes personnages restent dans l’équipe, sans joueur. Pour revenir, il te faudra un code.",
      confirmLabel: "Quitter l’équipe",
    });
    if (!ok) return;
    const { error } = await supabase.rpc("leave_team", { _team: t.id });
    if (error) return void setErr(error.message);
    await load();
  }

  return (
    <main>
      <div className="wrap teams-page">
        <div className="ph">
          <h1>MES ÉQUIPES</h1>
        </div>
        <InlineError message={err} onClear={() => setErr(null)} />
        {teams === null ? (
          <p className="note">Chargement…</p>
        ) : teams.length === 0 ? (
          <p className="note">Tu n’as pas encore d’équipe. Crées-en une ou rejoins tes amis.</p>
        ) : (
          <ul className="pcards">
            {teams.map((t) => (
              <li key={t.id} className="pcard cut-s admin-card">
                <div className="record-name">
                  <p>
                    {t.name}
                    {t.active && <span className="tag">ACTIVE</span>}
                  </p>
                  <p className="note">
                    {t.role === "gm" ? "MJ" : "Joueur"} · {t.members}{" "}
                    {t.members > 1 ? "membres" : "membre"}
                  </p>
                </div>
                <div className="admin-actions">
                  <Button variant="prototype" className="btn y" onClick={() => void open(t)}>
                    <LogIn size={16} /> Ouvrir
                  </Button>
                  <Button
                    variant="prototype"
                    className="btn"
                    title="Quitter l’équipe"
                    aria-label={`Quitter l’équipe ${t.name}`}
                    onClick={() => void leave(t)}
                  >
                    <DoorOpen size={16} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="teams-forms">
          <form
            className="panel cut"
            onSubmit={(e) => {
              e.preventDefault();
              void join();
            }}
          >
            <h2>Rejoindre une équipe</h2>
            <p className="note">Demande le code à ton MJ.</p>
            <input
              className="field team-code"
              placeholder="Code à 8 caractères"
              aria-label="Code d’invitation"
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={12}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <Button variant="prototype" className="btn y" disabled={busy || !code.trim()}>
              <LogIn size={16} /> Rejoindre
            </Button>
          </form>
          <form
            className="panel cut"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <h2>Créer une équipe</h2>
            <p className="note">Tu en seras le MJ.</p>
            <input
              className="field"
              placeholder="Nom de l’équipe"
              aria-label="Nom de l’équipe"
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button variant="prototype" className="btn y" disabled={busy || name.trim().length < 2}>
              <Plus size={16} /> Créer
            </Button>
          </form>
        </div>
        <p className="note">
          <Link to="/confidentialite">Confidentialité</Link>
        </p>
      </div>
    </main>
  );
}
