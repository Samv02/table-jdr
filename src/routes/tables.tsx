import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, CalendarDays, DoorOpen, LogIn, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/InlineError";
import { confirmAction } from "@/components/ConfirmDialog";
import { openTeam } from "@/lib/team";
import { useIdentity } from "@/lib/active-character";
import { loginDestination } from "@/lib/dashboard";
import {
  clearInvite,
  hubTable,
  readInvite,
  sessionLabel,
  sinceLabel,
  type HubRow,
  type HubTable,
} from "@/lib/hub";
import { fontFamily, fontsHref } from "@/lib/universe";

export const Route = createFileRoute("/tables")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Mes tables" },
      { name: "description", content: "Toutes tes parties, à un clic." },
    ],
  }),
  component: TablesPage,
});

function TablesPage() {
  const identity = useIdentity();
  const [tables, setTables] = useState<HubTable[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [invited, setInvited] = useState(false);
  const atTable = identity.ready && !!identity.teamId;

  async function load() {
    const { data, error } = await supabase.rpc("my_hub");
    if (error) return void setErr(error.message);
    setTables((data as HubRow[]).map(hubTable));
  }
  useEffect(() => {
    // Le hub est hors de la table : y arriver referme celle qui était ouverte
    if (atTable) void openTeam(null, "/tables");
    else void load();
  }, [atTable]);
  useEffect(() => setInvited(!!readInvite()), []);

  async function enter(t: HubTable) {
    const error = await openTeam(t.id, loginDestination(t.role === "gm"));
    if (error) setErr(error);
  }
  async function leave(t: HubTable) {
    const ok = await confirmAction({
      title: `Quitter « ${t.name} » ?`,
      message:
        "Tes personnages restent à la table, sans joueur. Pour revenir, il te faudra une invitation.",
      confirmLabel: "Quitter la table",
    });
    if (!ok) return;
    const { error } = await supabase.rpc("leave_team", { _team: t.id });
    if (error) return void setErr(error.message);
    await load();
  }

  if (atTable) return <main />;
  return (
    <main>
      <div className="wrap hub">
        <header className="hub-head">
          <h1>Mes tables</h1>
          <p>Choisis ta partie, tu y es en un clic.</p>
        </header>
        <InlineError message={err} onClear={() => setErr(null)} />
        {tables === null ? (
          <p className="note">Chargement…</p>
        ) : (
          <>
            {tables.length > 0 && (
              <ul className="hub-grid">
                {tables.map((t, i) => (
                  <TableCard
                    key={t.id}
                    table={t}
                    first={i === 0}
                    onEnter={() => void enter(t)}
                    onLeave={() => void leave(t)}
                  />
                ))}
              </ul>
            )}
            {tables.length === 0 && !invited && (
              <p className="hub-empty">
                Tu n’as encore aucune table. Lance la tienne, ou rejoins tes amis avec le code ou le
                lien de ton MJ.
              </p>
            )}
            <NewTable onError={setErr} />
          </>
        )}
        <p className="note hub-foot">
          <Link to="/confidentialite">Confidentialité</Link>
        </p>
      </div>
    </main>
  );
}

function TableCard({
  table: t,
  first,
  onEnter,
  onLeave,
}: {
  table: HubTable;
  first: boolean;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const theme = t.universe.theme;
  const session = sessionLabel(t.next_session);
  const gm = t.role === "gm";
  useEffect(() => {
    const href = fontsHref(theme);
    if (!href || document.querySelector(`link[href="${href}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.append(link);
  }, [theme]);
  return (
    <li
      className={`hub-card ${first ? "first" : ""}`}
      style={{
        ["--c-bg" as string]: theme.bg,
        ["--c-panel" as string]: theme.panel,
        ["--c-text" as string]: theme.text,
        ["--c-mute" as string]: theme.mute,
        ["--c-a" as string]: theme.cyan,
        ["--c-b" as string]: theme.pink,
        ["--c-go" as string]: theme.yellow,
        ["--c-title" as string]: fontFamily(theme.fontDisplay),
      }}
    >
      <Button className="hub-enter" aria-label={`Entrer dans ${t.name}`} onClick={onEnter}>
        <span className="hub-top">
          <span className="hub-role">{gm ? "MJ" : "Joueur"}</span>
          {t.isNew && <span className="hub-new">Du nouveau</span>}
        </span>
        <strong>{t.name}</strong>
        <small>{t.universe.words.tagline || t.universe.words.tableName}</small>
        <span className="hub-facts">
          <span>
            {gm
              ? `${t.sheets} ${t.sheets > 1 ? "personnages" : "personnage"} · ${t.members} ${t.members > 1 ? "membres" : "membre"}`
              : t.characters.join(", ") || "Personnage à venir"}
          </span>
          {t.scene && <span>Scène : {t.scene}</span>}
          {session ? (
            <span className="hub-session">
              <CalendarDays size={14} aria-hidden="true" /> {session}
            </span>
          ) : (
            t.last_activity && <span>Dernier jet {sinceLabel(t.last_activity)}</span>
          )}
        </span>
        <span className="hub-go">
          {first ? "Reprendre" : "Entrer"} <ArrowRight size={16} aria-hidden="true" />
        </span>
      </Button>
      <Button
        className="hub-leave"
        title="Quitter cette table"
        aria-label={`Quitter la table ${t.name}`}
        onClick={onLeave}
      >
        <DoorOpen size={15} />
      </Button>
    </li>
  );
}

function NewTable({ onError }: { onError: (message: string) => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const codeField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const invite = readInvite();
    if (!invite) return;
    setCode(invite);
    codeField.current?.focus();
  }, []);

  async function create() {
    if (busy) return;
    setBusy(true);
    const { error } = await supabase.rpc("create_team", { _name: name });
    setBusy(false);
    if (error) return onError(error.message);
    window.location.assign(loginDestination(true));
  }
  async function join() {
    if (busy) return;
    setBusy(true);
    const { error } = await supabase.rpc("join_team", { _code: code });
    setBusy(false);
    clearInvite();
    if (error) return onError(error.message);
    window.location.assign(loginDestination(false));
  }

  return (
    <div className="hub-new-tables">
      <form
        className="hub-form"
        onSubmit={(e) => {
          e.preventDefault();
          void join();
        }}
      >
        <h2>Rejoindre une table</h2>
        <p className="note">Avec le code ou le lien donné par ton MJ.</p>
        <div className="hub-form-row">
          <input
            ref={codeField}
            className="field team-code"
            placeholder="Code à 8 caractères"
            aria-label="Code d’invitation"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={12}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <Button type="submit" className="btn y" disabled={busy || !code.trim()}>
            <LogIn size={16} /> Rejoindre
          </Button>
        </div>
      </form>
      <form
        className="hub-form"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <h2>Créer une table</h2>
        <p className="note">Tu en seras le MJ.</p>
        <div className="hub-form-row">
          <input
            className="field"
            placeholder="Nom de la table"
            aria-label="Nom de la table"
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" className="btn y" disabled={busy || name.trim().length < 2}>
            <Plus size={16} /> Créer
          </Button>
        </div>
      </form>
    </div>
  );
}
