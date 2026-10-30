import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { Ban, KeyRound, LogIn, RefreshCw, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/InlineError";
import { confirmAction } from "@/components/ConfirmDialog";
import { useIdentity } from "@/lib/active-character";
import { deleteAccount, deleteTeam } from "@/lib/accounts.functions";
import {
  adminOverview,
  adminSendPasswordReset,
  adminSetSuspended,
  type AdminAccount,
  type AdminOverview,
  type AdminTeam,
} from "@/lib/admin.functions";
import { filterAccounts, formatDay, formatMoment } from "@/lib/admin";
import { openTeam } from "@/lib/team";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({ meta: [{ title: "Back office" }, { name: "robots", content: "noindex" }] }),
  component: AdminPage,
});

const TABS = [
  ["vue", "Vue globale"],
  ["equipes", "Équipes"],
  ["comptes", "Comptes"],
  ["activite", "Activité"],
] as const;
type Tab = (typeof TABS)[number][0];
const REFRESH_MS = 30000;

function AdminPage() {
  const id = useIdentity();
  const load = useServerFn(adminOverview);
  const suspend = useServerFn(adminSetSuspended);
  const sendReset = useServerFn(adminSendPasswordReset);
  const removeAccount = useServerFn(deleteAccount);
  const removeTeam = useServerFn(deleteTeam);
  const [data, setData] = useState<AdminOverview | null>(null);
  const [tab, setTab] = useState<Tab>("vue");
  const [search, setSearch] = useState("");
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
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [id.isAdmin, refresh]);

  async function run(action: () => Promise<unknown>, done?: string) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      if (done) setInfo(done);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Action impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function askDeleteTeam(t: AdminTeam) {
    const ok = await confirmAction({
      title: `Supprimer l’équipe « ${t.name} » ?`,
      message: `Ses ${t.characters} fiches, ses scènes, ses jets et ses messages seront supprimés. Les comptes des membres sont conservés. Action irréversible.`,
      confirmLabel: "Supprimer l’équipe",
    });
    if (ok) await run(() => removeTeam({ data: { teamId: t.id } }));
  }
  async function askDeleteAccount(a: AdminAccount) {
    const ok = await confirmAction({
      title: `Supprimer le compte « ${a.username ?? a.email} » ?`,
      message:
        "Son accès, son profil, ses avatars et ses jets seront supprimés. Ses fiches restent dans leur équipe, sans joueur. Action irréversible.",
      confirmLabel: "Supprimer le compte",
    });
    if (ok) await run(() => removeAccount({ data: { userId: a.id } }));
  }
  async function askSuspend(a: AdminAccount) {
    if (a.suspended) return run(() => suspend({ data: { userId: a.id, suspended: false } }));
    const ok = await confirmAction({
      title: `Suspendre « ${a.username ?? a.email} » ?`,
      message: "Il n’aura plus accès à aucune équipe jusqu’à sa réactivation. Rien n’est supprimé.",
      confirmLabel: "Suspendre",
    });
    if (ok) await run(() => suspend({ data: { userId: a.id, suspended: true } }));
  }

  if (!id.ready) return <main className="min-h-screen bg-background" />;
  if (!id.isAdmin)
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <p className="font-display text-destructive">ACCÈS RÉSERVÉ À L’ADMIN</p>
        <Link to="/" className="text-accent underline">
          Retour
        </Link>
      </main>
    );

  const accounts = data ? filterAccounts(data.accounts, search) : [];
  return (
    <main className="admin-page">
      <div className="wrap">
        <div className="ph">
          <h1>BACK OFFICE</h1>
          <Button
            variant="prototype"
            className="icon-btn cut-s"
            title="Actualiser"
            aria-label="Actualiser"
            onClick={() => void refresh()}
          >
            <RefreshCw />
          </Button>
        </div>
        <div className="gm-tabs">
          {TABS.map(([key, label]) => (
            <Button
              variant="prototype"
              key={key}
              className={tab === key ? "on" : ""}
              onClick={() => setTab(key)}
            >
              {label}
            </Button>
          ))}
        </div>
        <InlineError message={err} onClear={() => setErr(null)} />
        {info && <p className="note">{info}</p>}
        {!data ? (
          <p className="note">Chargement…</p>
        ) : tab === "vue" ? (
          <>
            <div className="admin-stats">
              <Stat label="Comptes" value={data.stats.accounts} />
              <Stat label="Suspendus" value={data.stats.suspended} />
              <Stat label="Équipes" value={data.stats.teams} />
              <Stat label="Fiches" value={data.stats.characters} />
              <Stat label="Jets (7 jours)" value={data.stats.rolls7d} />
              <Stat label="Messages (7 jours)" value={data.stats.messages7d} />
            </div>
            <h2 className="ph">DERNIÈRE ACTIVITÉ</h2>
            <EventList events={data.activity.slice(0, 8)} />
          </>
        ) : tab === "equipes" ? (
          <ul className="pcards">
            {data.teams.length === 0 && <li className="note">Aucune équipe.</li>}
            {data.teams.map((t) => (
              <li key={t.id} className="pcard cut-s admin-card">
                <div className="record-name">
                  <p>{t.name}</p>
                  <p className="note">
                    Code {t.join_code} · créée le {formatDay(t.created_at)}
                    {t.owner ? ` par ${t.owner}` : ""}
                  </p>
                  <p className="note">
                    {t.members.length} membres · {t.characters} fiches ·{" "}
                    {t.last_activity ? `actif ${formatMoment(t.last_activity)}` : "aucune activité"}
                  </p>
                  <p className="note">
                    {t.members
                      .map((m) => `${m.username ?? "?"}${m.role === "gm" ? " (MJ)" : ""}`)
                      .join(", ") || "Aucun membre"}
                  </p>
                </div>
                <div className="admin-actions">
                  <Button
                    variant="prototype"
                    className="btn y"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const error = await openTeam(t.id, "/mj/tableau");
                        if (error) throw new Error(error);
                      })
                    }
                  >
                    <LogIn size={16} /> Entrer
                  </Button>
                  <Button
                    variant="prototype"
                    className="btn red"
                    aria-label={`Supprimer l’équipe ${t.name}`}
                    title="Supprimer l’équipe"
                    disabled={busy}
                    onClick={() => void askDeleteTeam(t)}
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : tab === "comptes" ? (
          <>
            <input
              className="field admin-search"
              placeholder="Chercher un pseudo, un e-mail, une équipe"
              aria-label="Chercher un compte"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <ul className="pcards">
              {accounts.length === 0 && <li className="note">Aucun compte.</li>}
              {accounts.map((a) => (
                <li key={a.id} className={`pcard cut-s admin-card ${a.suspended ? "off" : ""}`}>
                  <div className="record-name">
                    <p>
                      {a.username ?? "Sans pseudo"}
                      {a.admin && <span className="tag">ADMIN</span>}
                      {a.suspended && <span className="tag">SUSPENDU</span>}
                    </p>
                    <p className="note">{a.email}</p>
                    <p className="note">
                      Inscrit le {formatDay(a.created_at)} · dernière connexion{" "}
                      {a.last_sign_in_at ? formatMoment(a.last_sign_in_at) : "jamais"}
                    </p>
                    <p className="note">
                      {a.teams
                        .map((t) => `${t.name}${t.role === "gm" ? " (MJ)" : ""}`)
                        .join(", ") || "Aucune équipe"}
                    </p>
                  </div>
                  {a.id !== id.userId && (
                    <div className="admin-actions">
                      <Button
                        variant="prototype"
                        className="btn"
                        title="Envoyer un e-mail de nouveau mot de passe"
                        aria-label={`Envoyer un nouveau mot de passe à ${a.username ?? a.email}`}
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () =>
                              sendReset({
                                data: {
                                  userId: a.id,
                                  redirectTo: `${window.location.origin}/mot-de-passe`,
                                },
                              }),
                            `E-mail envoyé à ${a.email}.`,
                          )
                        }
                      >
                        <KeyRound size={16} />
                      </Button>
                      <Button
                        variant="prototype"
                        className="btn"
                        title={a.suspended ? "Réactiver" : "Suspendre"}
                        aria-label={`${a.suspended ? "Réactiver" : "Suspendre"} ${a.username ?? a.email}`}
                        disabled={busy}
                        onClick={() => void askSuspend(a)}
                      >
                        {a.suspended ? <Undo2 size={16} /> : <Ban size={16} />}
                      </Button>
                      <Button
                        variant="prototype"
                        className="btn red"
                        title="Supprimer le compte"
                        aria-label={`Supprimer le compte ${a.username ?? a.email}`}
                        disabled={busy}
                        onClick={() => void askDeleteAccount(a)}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <EventList events={data.activity} />
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="panel cut admin-stat">
      <b>{value}</b>
      <small>{label}</small>
    </div>
  );
}

function EventList({ events }: { events: AdminOverview["activity"] }) {
  if (!events.length) return <p className="note">Rien pour l’instant.</p>;
  return (
    <ul className="pcards">
      {events.map((e) => (
        <li key={e.id} className="pcard cut-s admin-card">
          <div className="record-name">
            <p className="note">
              {formatMoment(e.at)} · {e.team} · {e.kind === "roll" ? "Jet" : "Message"}
              {e.secret ? (e.kind === "roll" ? " secret" : " privé") : ""}
            </p>
            <p>
              <b>{e.who}</b> {e.text}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
