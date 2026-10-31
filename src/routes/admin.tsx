import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Gauge,
  KeyRound,
  LifeBuoy,
  LogOut,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  UsersRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { InlineError } from "@/components/InlineError";
import { AdminAccounts } from "@/components/admin/AdminAccounts";
import { AdminActivity } from "@/components/admin/AdminActivity";
import { AdminControl } from "@/components/admin/AdminControl";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { AdminSupport } from "@/components/admin/AdminSupport";
import { AdminTeams } from "@/components/admin/AdminTeams";
import { useIdentity } from "@/lib/active-character";
import { adminOverview, type AdminOverview } from "@/lib/admin.functions";
import type { AccountFilter, TeamFilter, TodoItem } from "@/lib/admin";
import { openTeam } from "@/lib/team";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({ meta: [{ title: "Back office" }, { name: "robots", content: "noindex" }] }),
  component: AdminPage,
});

const TABS = [
  { key: "vue", label: "Vue globale", icon: Gauge },
  { key: "support", label: "Support", icon: LifeBuoy },
  { key: "equipes", label: "Équipes", icon: UsersRound },
  { key: "comptes", label: "Comptes", icon: Users },
  { key: "activite", label: "Activité", icon: Activity },
  { key: "pilotage", label: "Pilotage", icon: SlidersHorizontal },
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
  const [teamFilter, setTeamFilter] = useState<TeamFilter>("all");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
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

  function show(next: Tab) {
    setTab(next);
    setInfo(null);
    setFlaggedOnly(false);
    setAccountFilter("all");
    setTeamFilter("all");
  }
  function go(target: TodoItem["go"]) {
    show(target.tab);
    if (target.tab === "activite") setFlaggedOnly(true);
    if (target.tab === "comptes" && target.filter) setAccountFilter(target.filter as AccountFilter);
    if (target.tab === "equipes" && target.filter) setTeamFilter(target.filter as TeamFilter);
  }

  // routeGuard renvoie les autres comptes vers la bonne page
  if (!id.ready || !id.isAdmin) return <main className="bo-shell" />;

  return (
    <div className="bo-shell">
      <aside className="bo-side">
        <div className="bo-brand">
          <ShieldCheck size={20} aria-hidden="true" />
          <b>Back office</b>
        </div>
        <nav aria-label="Back office">
          {TABS.map(({ key, label, icon: Icon }) => (
            <Button
              key={key}
              className={tab === key ? "on" : ""}
              aria-current={tab === key ? "page" : undefined}
              onClick={() => show(key)}
            >
              <Icon size={18} aria-hidden="true" />
              {label}
              {key === "support" && !!data?.stats.ticketsOpen && (
                <i className="bo-count">{data.stats.ticketsOpen}</i>
              )}
            </Button>
          ))}
        </nav>
        <div className="bo-side-foot">
          <Link to="/mot-de-passe" title="Changer mon mot de passe">
            <KeyRound size={18} aria-hidden="true" />
            <span>Mot de passe</span>
          </Link>
          <Button
            onClick={async () => {
              await supabase.auth.signOut();
              await navigate({ to: "/", replace: true });
            }}
          >
            <LogOut size={18} aria-hidden="true" />
            <span>Déconnexion</span>
          </Button>
        </div>
      </aside>
      <main className="bo-main">
        <header className="bo-top">
          <h1>{TABS.find((t) => t.key === tab)?.label}</h1>
          <Button
            className="bo-btn"
            aria-label="Actualiser"
            title="Actualiser"
            disabled={busy}
            onClick={() => void refresh()}
          >
            <RefreshCw size={16} aria-hidden="true" />
          </Button>
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
          <AdminDashboard data={data} go={go} />
        ) : tab === "support" ? (
          <AdminSupport onChanged={() => void refresh()} />
        ) : tab === "equipes" ? (
          <AdminTeams
            teams={data.teams}
            accounts={data.accounts}
            filter={teamFilter}
            setFilter={setTeamFilter}
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
        ) : tab === "activite" ? (
          <AdminActivity
            key={String(flaggedOnly)}
            events={data.activity}
            teams={data.teams}
            words={data.moderationWords}
            flaggedOnly={flaggedOnly}
            busy={busy}
            run={run}
          />
        ) : (
          <AdminControl key={JSON.stringify(data.settings)} data={data} busy={busy} run={run} />
        )}
      </main>
    </div>
  );
}
