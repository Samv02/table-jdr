import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  Ban,
  ChevronDown,
  Download,
  KeyRound,
  Save,
  Plus,
  ShieldCheck,
  Trash2,
  Undo2,
  UserMinus,
} from "lucide-react";
import { confirmAction } from "@/components/ConfirmDialog";
import { deleteAccount } from "@/lib/accounts.functions";
import { adminExportAccount, adminSetNote, adminSetPassword } from "@/lib/admin-platform.functions";
import {
  adminCreateAccount,
  adminSendPasswordReset,
  adminSetMember,
  adminSetPlatformAdmin,
  adminSetSuspended,
  adminUpdateAccount,
  type AdminAccount,
  type AdminTeam,
} from "@/lib/admin.functions";
import {
  downloadFile,
  filterAccounts,
  formatDay,
  formatMoment,
  type AccountFilter,
} from "@/lib/admin";
import type { AdminRun } from "@/routes/admin";
import { Button } from "@/components/ui/button";

const FILTERS: { key: AccountFilter; label: string }[] = [
  { key: "all", label: "Tous" },
  { key: "suspended", label: "Suspendus" },
  { key: "admin", label: "Admins" },
  { key: "noTeam", label: "Sans équipe" },
  { key: "neverSignedIn", label: "Jamais connectés" },
];

export function AdminAccounts({
  accounts,
  teams,
  selfId,
  filter,
  setFilter,
  busy,
  run,
}: {
  accounts: AdminAccount[];
  teams: AdminTeam[];
  selfId: string | null;
  filter: AccountFilter;
  setFilter: (f: AccountFilter) => void;
  busy: boolean;
  run: AdminRun;
}) {
  const create = useServerFn(adminCreateAccount);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const shown = filterAccounts(accounts, search, filter);

  return (
    <>
      <div className="bo-row">
        <input
          className="bo-input"
          placeholder="Chercher un pseudo, un e-mail, une équipe"
          aria-label="Chercher un compte"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button className="bo-btn primary" onClick={() => setAdding((v) => !v)}>
          <Plus size={16} aria-hidden="true" /> Nouveau compte
        </Button>
      </div>
      {adding && (
        <form
          className="bo-card bo-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await create({ data: { email, password, username } });
              setEmail("");
              setPassword("");
              setUsername("");
              setAdding(false);
            }, `Compte ${email} créé.`);
          }}
        >
          <input
            className="bo-input"
            type="email"
            placeholder="E-mail"
            aria-label="E-mail du nouveau compte"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="bo-input"
            placeholder="Pseudo (facultatif)"
            aria-label="Pseudo du nouveau compte"
            maxLength={20}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            className="bo-input"
            type="text"
            autoComplete="off"
            placeholder="Mot de passe provisoire (8 caractères minimum)"
            aria-label="Mot de passe provisoire"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" className="bo-btn primary" disabled={busy}>
            Créer le compte
          </Button>
        </form>
      )}
      <div className="bo-filters">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            className={`bo-chip ${filter === f.key ? "on" : ""}`}
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
        <span className="bo-muted">
          {shown.length} sur {accounts.length}
        </span>
      </div>
      <ul className="bo-list">
        {shown.length === 0 && <li className="bo-muted">Aucun compte.</li>}
        {shown.map((a) => (
          <li key={a.id} className={`bo-card ${a.suspended ? "off" : ""}`}>
            <Button
              className="bo-card-head"
              aria-expanded={open === a.id}
              onClick={() => setOpen(open === a.id ? null : a.id)}
            >
              <span className="bo-card-title">
                <b>{a.username ?? "Sans pseudo"}</b>
                {a.admin && <i className="bo-tag">Admin</i>}
                {a.suspended && <i className="bo-tag red">Suspendu</i>}
                <small>{a.email}</small>
              </span>
              <small className="bo-card-side">
                {a.teams.map((t) => t.name).join(", ") || "Aucune équipe"}
              </small>
              <ChevronDown size={18} aria-hidden="true" />
            </Button>
            {open === a.id && (
              <AccountDetail
                key={`${a.username}-${a.email}`}
                account={a}
                teams={teams}
                self={a.id === selfId}
                busy={busy}
                run={run}
              />
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function AccountDetail({
  account: a,
  teams,
  self,
  busy,
  run,
}: {
  account: AdminAccount;
  teams: AdminTeam[];
  self: boolean;
  busy: boolean;
  run: AdminRun;
}) {
  const update = useServerFn(adminUpdateAccount);
  const suspend = useServerFn(adminSetSuspended);
  const setAdmin = useServerFn(adminSetPlatformAdmin);
  const sendReset = useServerFn(adminSendPasswordReset);
  const setMember = useServerFn(adminSetMember);
  const remove = useServerFn(deleteAccount);
  const setPass = useServerFn(adminSetPassword);
  const saveNote = useServerFn(adminSetNote);
  const exportData = useServerFn(adminExportAccount);
  const [password, setPassword] = useState("");
  const [note, setNote] = useState(a.note);
  const [username, setUsername] = useState(a.username ?? "");
  const [email, setEmail] = useState(a.email ?? "");
  const [teamId, setTeamId] = useState("");
  const name = a.username ?? a.email ?? "ce compte";
  const others = teams.filter((t) => !a.teams.some((x) => x.id === t.id));

  async function askSuspend() {
    if (a.suspended) return run(() => suspend({ data: { userId: a.id, suspended: false } }));
    const ok = await confirmAction({
      title: `Suspendre « ${name} » ?`,
      message: "Plus aucun accès aux équipes jusqu’à sa réactivation. Rien n’est supprimé.",
      confirmLabel: "Suspendre",
    });
    if (ok) await run(() => suspend({ data: { userId: a.id, suspended: true } }));
  }
  async function askAdmin() {
    const ok = await confirmAction({
      title: a.admin ? `Retirer l’accès admin de « ${name} » ?` : `Rendre « ${name} » admin ?`,
      message: a.admin
        ? "Ce compte n’aura plus accès au back office."
        : "Ce compte verra tous les comptes, toutes les équipes, et tous les messages privés.",
      confirmLabel: a.admin ? "Retirer l’accès" : "Donner l’accès admin",
    });
    if (ok) await run(() => setAdmin({ data: { userId: a.id, admin: !a.admin } }));
  }
  async function askDelete() {
    const ok = await confirmAction({
      title: `Supprimer le compte « ${name} » ?`,
      message:
        "Son accès, son profil, ses avatars et ses jets seront supprimés. Ses fiches restent dans leur équipe, sans joueur. Action irréversible.",
      confirmLabel: "Supprimer le compte",
    });
    if (ok) await run(() => remove({ data: { userId: a.id } }));
  }

  return (
    <div className="bo-detail">
      <p className="bo-muted">
        Inscrit le {formatDay(a.created_at)} · dernière connexion{" "}
        {a.last_sign_in_at ? formatMoment(a.last_sign_in_at) : "jamais"}
      </p>
      <form
        className="bo-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => update({ data: { userId: a.id, username, email } }), "Compte enregistré.");
        }}
      >
        <label>
          Pseudo
          <input
            className="bo-input"
            maxLength={20}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label>
          E-mail
          <input
            className="bo-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <Button type="submit" className="bo-btn primary" disabled={busy}>
          Enregistrer
        </Button>
      </form>

      <h3>Note interne</h3>
      <textarea
        className="bo-input bo-area"
        rows={2}
        maxLength={2000}
        placeholder="Visible par les admins uniquement"
        aria-label="Note interne"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="bo-actions">
        <Button
          className="bo-btn"
          disabled={busy || note === a.note}
          onClick={() =>
            void run(() => saveNote({ data: { userId: a.id, body: note } }), "Note enregistrée.")
          }
        >
          <Save size={16} aria-hidden="true" /> Enregistrer la note
        </Button>
      </div>

      <h3>Équipes</h3>
      {a.teams.length === 0 && <p className="bo-muted">Aucune équipe.</p>}
      <ul className="bo-rows">
        {a.teams.map((t) => (
          <li key={t.id}>
            <span>{t.name}</span>
            <select
              className="bo-input"
              aria-label={`Rôle dans ${t.name}`}
              value={t.role}
              disabled={busy}
              onChange={(e) =>
                void run(() =>
                  setMember({
                    data: { teamId: t.id, userId: a.id, role: e.target.value as "player" | "gm" },
                  }),
                )
              }
            >
              <option value="player">Joueur</option>
              <option value="gm">MJ</option>
            </select>
            <Button
              className="bo-btn"
              title="Retirer de l’équipe"
              aria-label={`Retirer de ${t.name}`}
              disabled={busy}
              onClick={() =>
                void run(() => setMember({ data: { teamId: t.id, userId: a.id, role: null } }))
              }
            >
              <UserMinus size={16} aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
      {others.length > 0 && (
        <div className="bo-row">
          <select
            className="bo-input"
            aria-label="Équipe à rejoindre"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
          >
            <option value="">Ajouter à une équipe…</option>
            {others.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <Button
            className="bo-btn"
            disabled={busy || !teamId}
            onClick={() =>
              void run(async () => {
                await setMember({ data: { teamId, userId: a.id, role: "player" } });
                setTeamId("");
              })
            }
          >
            <Plus size={16} aria-hidden="true" /> Ajouter
          </Button>
        </div>
      )}

      {!self && (
        <>
          <h3>Mot de passe</h3>
          <form
            className="bo-row"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await setPass({ data: { userId: a.id, password } });
                setPassword("");
              }, "Mot de passe provisoire défini.");
            }}
          >
            <input
              className="bo-input"
              type="text"
              autoComplete="off"
              minLength={8}
              required
              placeholder="Mot de passe provisoire (8 caractères minimum)"
              aria-label="Nouveau mot de passe provisoire"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="submit" className="bo-btn" disabled={busy}>
              Définir
            </Button>
          </form>

          <h3>Actions</h3>
          <div className="bo-actions">
            <Button
              className="bo-btn"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const json = await exportData({ data: { userId: a.id } });
                  downloadFile(`compte-${a.username ?? a.id}.json`, json, "application/json");
                })
              }
            >
              <Download size={16} aria-hidden="true" /> Exporter ses données
            </Button>
            <Button
              className="bo-btn"
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
                  `Lien envoyé à ${a.email}.`,
                )
              }
            >
              <KeyRound size={16} aria-hidden="true" /> Envoyer un lien de mot de passe
            </Button>
            <Button className="bo-btn" disabled={busy} onClick={() => void askAdmin()}>
              <ShieldCheck size={16} aria-hidden="true" />
              {a.admin ? "Retirer l’accès admin" : "Rendre admin"}
            </Button>
            <Button className="bo-btn" disabled={busy} onClick={() => void askSuspend()}>
              {a.suspended ? (
                <Undo2 size={16} aria-hidden="true" />
              ) : (
                <Ban size={16} aria-hidden="true" />
              )}
              {a.suspended ? "Réactiver" : "Suspendre"}
            </Button>
            <Button className="bo-btn danger" disabled={busy} onClick={() => void askDelete()}>
              <Trash2 size={16} aria-hidden="true" /> Supprimer le compte
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
