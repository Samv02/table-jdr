import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ChevronDown, Eraser, LogIn, Plus, RefreshCw, Trash2, UserMinus } from "lucide-react";
import { confirmAction } from "@/components/ConfirmDialog";
import { deleteTeam } from "@/lib/accounts.functions";
import { adminClearTeamData } from "@/lib/admin-platform.functions";
import {
  adminCreateTeam,
  adminDeleteCharacter,
  adminRegenerateCode,
  adminRenameTeam,
  adminSetCharacterOwner,
  adminSetMember,
  type AdminAccount,
  type AdminTeam,
} from "@/lib/admin.functions";
import { filterTeams, formatDay, formatMoment, plural, type TeamFilter } from "@/lib/admin";
import { openTeam } from "@/lib/team";
import type { AdminRun } from "@/routes/admin";

const FILTERS: { key: TeamFilter; label: string }[] = [
  { key: "all", label: "Toutes" },
  { key: "noGm", label: "Sans MJ" },
  { key: "empty", label: "Vides" },
  { key: "inactive", label: "Inactives 7 jours" },
];

export function AdminTeams({
  teams,
  accounts,
  filter,
  setFilter,
  busy,
  run,
  onError,
}: {
  teams: AdminTeam[];
  accounts: AdminAccount[];
  filter: TeamFilter;
  setFilter: (f: TeamFilter) => void;
  busy: boolean;
  run: AdminRun;
  onError: (message: string) => void;
}) {
  const create = useServerFn(adminCreateTeam);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [gmId, setGmId] = useState("");
  const shown = filterTeams(teams, search, filter);

  return (
    <>
      <div className="bo-row">
        <input
          className="bo-input"
          placeholder="Chercher une équipe, un code, un membre"
          aria-label="Chercher une équipe"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" className="bo-btn primary" onClick={() => setAdding((v) => !v)}>
          <Plus size={16} aria-hidden="true" /> Nouvelle équipe
        </button>
      </div>
      {adding && (
        <form
          className="bo-card bo-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await create({ data: { name, gmId: gmId || null } });
              setName("");
              setGmId("");
              setAdding(false);
            }, `Équipe ${name} créée.`);
          }}
        >
          <input
            className="bo-input"
            placeholder="Nom de l’équipe"
            aria-label="Nom de la nouvelle équipe"
            maxLength={40}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            className="bo-input"
            aria-label="MJ de la nouvelle équipe"
            value={gmId}
            onChange={(e) => setGmId(e.target.value)}
          >
            <option value="">Sans MJ pour l’instant</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.username ?? a.email}
              </option>
            ))}
          </select>
          <button type="submit" className="bo-btn primary" disabled={busy}>
            Créer l’équipe
          </button>
        </form>
      )}
      <div className="bo-filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`bo-chip ${filter === f.key ? "on" : ""}`}
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
        <span className="bo-muted">
          {shown.length} sur {teams.length}
        </span>
      </div>
      <ul className="bo-list">
        {shown.length === 0 && <li className="bo-muted">Aucune équipe.</li>}
        {shown.map((t) => (
          <li key={t.id} className="bo-card">
            <button
              type="button"
              className="bo-card-head"
              aria-expanded={open === t.id}
              onClick={() => setOpen(open === t.id ? null : t.id)}
            >
              <span className="bo-card-title">
                <b>{t.name}</b>
                {t.members.length === 0 && <i className="bo-tag red">Vide</i>}
                <small>
                  {plural(t.members.length, "membre")} · {plural(t.characters.length, "fiche")} ·{" "}
                  {t.last_activity ? `actif ${formatMoment(t.last_activity)}` : "aucune activité"}
                </small>
              </span>
              <code className="bo-card-side">{t.join_code}</code>
              <ChevronDown size={18} aria-hidden="true" />
            </button>
            {open === t.id && (
              <TeamDetail
                key={t.name}
                team={t}
                accounts={accounts}
                busy={busy}
                run={run}
                onError={onError}
              />
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function TeamDetail({
  team: t,
  accounts,
  busy,
  run,
  onError,
}: {
  team: AdminTeam;
  accounts: AdminAccount[];
  busy: boolean;
  run: AdminRun;
  onError: (message: string) => void;
}) {
  const rename = useServerFn(adminRenameTeam);
  const regenerate = useServerFn(adminRegenerateCode);
  const setMember = useServerFn(adminSetMember);
  const setOwner = useServerFn(adminSetCharacterOwner);
  const removeCharacter = useServerFn(adminDeleteCharacter);
  const removeTeam = useServerFn(deleteTeam);
  const clearData = useServerFn(adminClearTeamData);
  const [name, setName] = useState(t.name);
  const [userId, setUserId] = useState("");
  const candidates = accounts.filter((a) => !t.members.some((m) => m.user_id === a.id));

  async function askRegenerate() {
    const ok = await confirmAction({
      title: "Changer le code d’invitation ?",
      message: "L’ancien code ne marchera plus. Les membres restent dans l’équipe.",
      confirmLabel: "Changer le code",
    });
    if (ok) await run(() => regenerate({ data: { teamId: t.id } }));
  }
  async function askDeleteCharacter(id: string, label: string) {
    const ok = await confirmAction({
      title: `Supprimer la fiche « ${label} » ?`,
      message: "La fiche et son état seront supprimés. Action irréversible.",
    });
    if (ok) await run(() => removeCharacter({ data: { characterId: id } }));
  }
  async function askClear(kind: "rolls" | "messages") {
    const label = kind === "rolls" ? "les jets" : "les messages";
    const ok = await confirmAction({
      title: `Vider ${label} de « ${t.name} » ?`,
      message: `Tout l’historique sera supprimé pour tout le monde. Les fiches et les membres ne bougent pas. Action irréversible.`,
      confirmLabel: `Vider ${label}`,
    });
    if (ok) await run(() => clearData({ data: { teamId: t.id, kind } }));
  }
  async function askDeleteTeam() {
    const ok = await confirmAction({
      title: `Supprimer l’équipe « ${t.name} » ?`,
      message: `Ses ${t.characters.length} fiches, ses scènes, ses jets et ses messages seront supprimés. Les comptes des membres sont conservés. Action irréversible.`,
      confirmLabel: "Supprimer l’équipe",
    });
    if (ok) await run(() => removeTeam({ data: { teamId: t.id } }));
  }

  return (
    <div className="bo-detail">
      <p className="bo-muted">
        Créée le {formatDay(t.created_at)}
        {t.owner ? ` par ${t.owner}` : ""}
      </p>
      <form
        className="bo-row"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => rename({ data: { teamId: t.id, name } }), "Équipe renommée.");
        }}
      >
        <input
          className="bo-input"
          aria-label="Nom de l’équipe"
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="bo-btn" disabled={busy || name.trim() === t.name}>
          Renommer
        </button>
      </form>

      <h3>Membres</h3>
      {t.members.length === 0 && <p className="bo-muted">Aucun membre.</p>}
      <ul className="bo-rows">
        {t.members.map((m) => (
          <li key={m.user_id}>
            <span>{m.username ?? "Sans pseudo"}</span>
            <select
              className="bo-input"
              aria-label={`Rôle de ${m.username ?? "ce membre"}`}
              value={m.role}
              disabled={busy}
              onChange={(e) =>
                void run(() =>
                  setMember({
                    data: {
                      teamId: t.id,
                      userId: m.user_id,
                      role: e.target.value as "player" | "gm",
                    },
                  }),
                )
              }
            >
              <option value="player">Joueur</option>
              <option value="gm">MJ</option>
            </select>
            <button
              type="button"
              className="bo-btn"
              title="Retirer de l’équipe"
              aria-label={`Retirer ${m.username ?? "ce membre"}`}
              disabled={busy}
              onClick={() =>
                void run(() => setMember({ data: { teamId: t.id, userId: m.user_id, role: null } }))
              }
            >
              <UserMinus size={16} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {candidates.length > 0 && (
        <div className="bo-row">
          <select
            className="bo-input"
            aria-label="Compte à ajouter"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            <option value="">Ajouter un compte…</option>
            {candidates.map((a) => (
              <option key={a.id} value={a.id}>
                {a.username ?? a.email}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="bo-btn"
            disabled={busy || !userId}
            onClick={() =>
              void run(async () => {
                await setMember({ data: { teamId: t.id, userId, role: "player" } });
                setUserId("");
              })
            }
          >
            <Plus size={16} aria-hidden="true" /> Ajouter
          </button>
        </div>
      )}

      <h3>Fiches</h3>
      {t.characters.length === 0 && <p className="bo-muted">Aucune fiche.</p>}
      <ul className="bo-rows">
        {t.characters.map((c) => (
          <li key={c.id}>
            <span>{c.name}</span>
            <select
              className="bo-input"
              aria-label={`Joueur de ${c.name}`}
              value={c.owner_id ?? ""}
              disabled={busy}
              onChange={(e) =>
                void run(() =>
                  setOwner({ data: { characterId: c.id, ownerId: e.target.value || null } }),
                )
              }
            >
              <option value="">Aucun joueur</option>
              {t.members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.username ?? "Sans pseudo"}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="bo-btn danger"
              title="Supprimer la fiche"
              aria-label={`Supprimer la fiche ${c.name}`}
              disabled={busy}
              onClick={() => void askDeleteCharacter(c.id, c.name)}
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>

      <h3>Actions</h3>
      <div className="bo-actions">
        <button
          type="button"
          className="bo-btn"
          disabled={busy}
          title="Intervenir dans l’équipe avec les droits du MJ"
          onClick={async () => {
            const error = await openTeam(t.id, "/mj/tableau");
            if (error) onError(error);
          }}
        >
          <LogIn size={16} aria-hidden="true" /> Ouvrir comme MJ
        </button>
        <button
          type="button"
          className="bo-btn"
          disabled={busy}
          onClick={() => void askRegenerate()}
        >
          <RefreshCw size={16} aria-hidden="true" /> Changer le code
        </button>
        <button
          type="button"
          className="bo-btn"
          disabled={busy}
          onClick={() => void askClear("rolls")}
        >
          <Eraser size={16} aria-hidden="true" /> Vider les jets
        </button>
        <button
          type="button"
          className="bo-btn"
          disabled={busy}
          onClick={() => void askClear("messages")}
        >
          <Eraser size={16} aria-hidden="true" /> Vider les messages
        </button>
        <button
          type="button"
          className="bo-btn danger"
          disabled={busy}
          onClick={() => void askDeleteTeam()}
        >
          <Trash2 size={16} aria-hidden="true" /> Supprimer l’équipe
        </button>
      </div>
    </div>
  );
}
