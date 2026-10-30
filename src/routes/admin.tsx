import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Gauge,
  KeyRound,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Users,
  UsersRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { InlineError } from "@/components/InlineError";
import { AdminAccounts } from "@/components/admin/AdminAccounts";
import { AdminTeams } from "@/components/admin/AdminTeams";
import { useIdentity } from "@/lib/active-character";
import { adminOverview, type AdminEvent, type AdminOverview } from "@/lib/admin.functions";
import { filterEvents, formatMoment, type AccountFilter, type EventFilter } from "@/lib/admin";
import { openTeam } from "@/lib/team";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({ meta: [{ title: "Back office" }, { name: "robots", content: "noindex" }] }),
  component: AdminPage,
});

const TABS = [
  { key: "vue", label: "Vue globale", icon: Gauge },
  { key: "equipes", label: "Équipes", icon: UsersRound },
  { key: "comptes", label: "Comptes", icon: Users },
  { key: "activite", label: "Activité", icon: Activity },
] as const;
type Tab = (typeof TABS)[number]["key"];
const REFRESH_MS = 30000;

export type AdminRun = (action: () => Promise<unknown>, done?: string) => Promise<void>;

function AdminPage() {
  const id = useIdentity();
  const navigate = useNavigate();
  const load = useServerFn(adminOverview);
  const [data, setData] = useState<AdminOverview | null>(null);
  const [tab, setTab] = useState<Tab>("vue");
  const [accountFilter, setAccountFilter] = useState<AccountFilter>("all");
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setData(await load());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Chargement impossible.");
    }
  }, [load]);

  useEffect(() => {
    if (!id.isAdmin) return;
    // Revenir ici depuis une équipe termine la visite : le back office vit hors de toute équipe
    if (id.isVisitor) {
      void openTeam(null, "/admin");
      return;
    }
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [id.isAdmin, id.isVisitor, refresh]);

  const run: AdminRun = async (action, done) => {
    if (busy) return;
    setBusy(true);
    setInfo(null);
    try {
      await action();
      if (done) setInfo(done);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Action impossible.");
    } finally {
      setBusy(false);
    }
  };

  function show(next: Tab, filter: AccountFilter = "all") {
    setTab(next);
    setAccountFilter(filter);
  }

  if (!id.ready) return <main className="bo-shell" />;
  if (!id.isAdmin)
    return (
      <main className="bo-denied">
        <p>ACCÈS RÉSERVÉ À L’ADMIN</p>
        <Link to="/">Retour</Link>
      </main>
    );

  return (
    <div className="bo-shell">
      <aside className="bo-side">
        <div className="bo-brand">
          <ShieldCheck size={20} aria-hidden="true" />
          <b>Back office</b>
        </div>
        <nav aria-label="Back office">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className={tab === key ? "on" : ""}
              aria-current={tab === key ? "page" : undefined}
              onClick={() => show(key)}
            >
              <Icon size={18} aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>
        <div className="bo-side-foot">
          <Link to="/mot-de-passe" title="Changer mon mot de passe">
            <KeyRound size={18} aria-hidden="true" />
            <span>Mot de passe</span>
          </Link>
          <button
            type="button"
            onClick={async () => {
              await supabase.auth.signOut();
              await navigate({ to: "/", replace: true });
            }}
          >
            <LogOut size={18} aria-hidden="true" />
            <span>Déconnexion</span>
          </button>
        </div>
      </aside>
      <main className="bo-main">
        <header className="bo-top">
          <h1>{TABS.find((t) => t.key === tab)?.label}</h1>
          <button
            type="button"
            className="bo-btn"
            aria-label="Actualiser"
            title="Actualiser"
            disabled={busy}
            onClick={() => void refresh()}
          >
            <RefreshCw size={16} aria-hidden="true" />
          </button>
        </header>
        <InlineError message={err} onClear={() => setErr(null)} />
        {info && (
          <p className="bo-info" role="status">
            {info}
          </p>
        )}
        {!data ? (
          <p className="bo-muted">Chargement…</p>
        ) : tab === "vue" ? (
          <Overview data={data} show={show} />
        ) : tab === "equipes" ? (
          <AdminTeams
            teams={data.teams}
            accounts={data.accounts}
            busy={busy}
            run={run}
            onError={setErr}
          />
        ) : tab === "comptes" ? (
          <AdminAccounts
            accounts={data.accounts}
            teams={data.teams}
            selfId={id.userId}
            filter={accountFilter}
            setFilter={setAccountFilter}
            busy={busy}
            run={run}
          />
        ) : (
          <ActivityLog events={data.activity} teams={data.teams.map((t) => t.name)} />
        )}
      </main>
    </div>
  );
}

function Overview({
  data,
  show,
}: {
  data: AdminOverview;
  show: (tab: Tab, filter?: AccountFilter) => void;
}) {
  const s = data.stats;
  const cards: { label: string; value: number; go: () => void; alert?: boolean }[] = [
    { label: "Comptes", value: s.accounts, go: () => show("comptes") },
    { label: "Nouveaux (7 jours)", value: s.newAccounts7d, go: () => show("comptes") },
    { label: "Connectés (7 jours)", value: s.active7d, go: () => show("comptes") },
    {
      label: "Suspendus",
      value: s.suspended,
      go: () => show("comptes", "suspended"),
      alert: s.suspended > 0,
    },
    {
      label: "Sans équipe",
      value: s.noTeam,
      go: () => show("comptes", "noTeam"),
      alert: s.noTeam > 0,
    },
    { label: "Équipes", value: s.teams, go: () => show("equipes") },
    {
      label: "Équipes vides",
      value: s.emptyTeams,
      go: () => show("equipes"),
      alert: s.emptyTeams > 0,
    },
    { label: "Fiches", value: s.characters, go: () => show("equipes") },
    { label: "Jets (7 jours)", value: s.rolls7d, go: () => show("activite") },
    { label: "Messages (7 jours)", value: s.messages7d, go: () => show("activite") },
  ];
  return (
    <>
      <div className="bo-stats">
        {cards.map((c) => (
          <button
            key={c.label}
            type="button"
            className={`bo-stat ${c.alert ? "alert" : ""}`}
            onClick={c.go}
          >
            <b>{c.value}</b>
            <small>{c.label}</small>
          </button>
        ))}
      </div>
      <h2 className="bo-section">Dernière activité</h2>
      <EventList events={data.activity.slice(0, 8)} />
    </>
  );
}

const KINDS: { key: EventFilter; label: string }[] = [
  { key: "all", label: "Tout" },
  { key: "roll", label: "Jets" },
  { key: "message", label: "Messages" },
  { key: "admin", label: "Journal admin" },
];

function ActivityLog({ events, teams }: { events: AdminEvent[]; teams: string[] }) {
  const [kind, setKind] = useState<EventFilter>("all");
  const [team, setTeam] = useState("");
  const [search, setSearch] = useState("");
  const shown = useMemo(
    () => filterEvents(events, kind, team, search),
    [events, kind, team, search],
  );
  return (
    <>
      <div className="bo-filters">
        {KINDS.map((k) => (
          <button
            key={k.key}
            type="button"
            className={`bo-chip ${kind === k.key ? "on" : ""}`}
            aria-pressed={kind === k.key}
            onClick={() => setKind(k.key)}
          >
            {k.label}
          </button>
        ))}
      </div>
      <div className="bo-row">
        <input
          className="bo-input"
          placeholder="Chercher un nom, un message"
          aria-label="Chercher dans l’activité"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="bo-input"
          aria-label="Filtrer par équipe"
          value={team}
          onChange={(e) => setTeam(e.target.value)}
        >
          <option value="">Toutes les équipes</option>
          {teams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <EventList events={shown} />
    </>
  );
}

const KIND_LABEL = { roll: "Jet", message: "Message", admin: "Admin" } as const;

function EventList({ events }: { events: AdminEvent[] }) {
  if (!events.length) return <p className="bo-muted">Rien pour l’instant.</p>;
  return (
    <ul className="bo-list">
      {events.map((e) => (
        <li key={e.id} className="bo-card">
          <p className="bo-muted">
            {formatMoment(e.at)}
            {e.team ? ` · ${e.team}` : ""} · {KIND_LABEL[e.kind]}
            {e.secret ? (e.kind === "roll" ? " secret" : " privé") : ""}
          </p>
          <p className="bo-text">
            <b>{e.who}</b> {e.text}
          </p>
        </li>
      ))}
    </ul>
  );
}
