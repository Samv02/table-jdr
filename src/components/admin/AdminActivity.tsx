import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Dices, EyeOff, Megaphone, MessageSquare, ScrollText, Trash2 } from "lucide-react";
import { confirmAction } from "@/components/ConfirmDialog";
import { adminDeleteMessage } from "@/lib/admin-platform.functions";
import type { AdminEvent, AdminTeam } from "@/lib/admin.functions";
import {
  filterEvents,
  formatTime,
  groupByDay,
  logCategory,
  type EventKind,
  type EventVisibility,
  type LogCategory,
} from "@/lib/admin";
import type { AdminRun } from "@/routes/admin";

const VIEWS: { key: EventKind; label: string; icon: typeof Dices }[] = [
  { key: "roll", label: "Jets", icon: Dices },
  { key: "message", label: "Messages", icon: MessageSquare },
  { key: "admin", label: "Journal admin", icon: ScrollText },
];
const PERIODS = [
  { days: 1, label: "24 heures" },
  { days: 7, label: "7 jours" },
  { days: 30, label: "30 jours" },
  { days: 0, label: "Tout" },
];
const CATEGORIES: { key: LogCategory; label: string }[] = [
  { key: "all", label: "Tout" },
  { key: "comptes", label: "Comptes" },
  { key: "equipes", label: "Équipes" },
  { key: "fiches", label: "Fiches" },
  { key: "support", label: "Support" },
  { key: "reglages", label: "Réglages" },
];
const PAGE = 50;

export function AdminActivity({
  events,
  teams,
  busy,
  run,
}: {
  events: AdminEvent[];
  teams: AdminTeam[];
  busy: boolean;
  run: AdminRun;
}) {
  const removeMessage = useServerFn(adminDeleteMessage);
  const [kind, setKind] = useState<EventKind>("roll");
  const [teamId, setTeamId] = useState("");
  const [days, setDays] = useState(0);
  const [visibility, setVisibility] = useState<EventVisibility>("all");
  const [category, setCategory] = useState<LogCategory>("all");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const inJournal = kind === "admin";
  const shown = useMemo(
    () =>
      filterEvents(events, {
        kind,
        teamId: inJournal ? "" : teamId,
        days,
        visibility: inJournal ? "all" : visibility,
        category: inJournal ? category : "all",
        search,
        now: Date.now(),
      }),
    [events, kind, inJournal, teamId, days, visibility, category, search],
  );
  const groups = groupByDay(shown.slice(0, limit));
  // Les équipes sans rien à montrer dans cette vue restent atteignables, mais en fin de liste
  const countFor = (id: string) => events.filter((e) => e.kind === kind && e.teamId === id).length;

  async function askDelete(e: AdminEvent) {
    const ok = await confirmAction({
      title: "Supprimer ce message ?",
      message: `${e.who} (${e.team}) : « ${e.text.slice(0, 80)} »\nIl disparaîtra pour tout le monde.`,
    });
    if (ok) await run(() => removeMessage({ data: { id: e.rawId } }));
  }

  return (
    <>
      <div className="bo-views" role="tablist" aria-label="Type d’activité">
        {VIEWS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={kind === key}
            className={kind === key ? "on" : ""}
            onClick={() => {
              setKind(key);
              setLimit(PAGE);
            }}
          >
            <Icon size={16} aria-hidden="true" /> {label}
          </button>
        ))}
      </div>
      {inJournal ? (
        <div className="bo-filters">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`bo-chip ${category === c.key ? "on" : ""}`}
              aria-pressed={category === c.key}
              onClick={() => setCategory(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="bo-filters" aria-label="Filtrer par équipe">
          <button
            type="button"
            className={`bo-chip ${teamId === "" ? "on" : ""}`}
            aria-pressed={teamId === ""}
            onClick={() => setTeamId("")}
          >
            Toutes les équipes
          </button>
          {teams.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`bo-chip ${teamId === t.id ? "on" : ""}`}
              aria-pressed={teamId === t.id}
              onClick={() => setTeamId(t.id)}
            >
              {t.name} <small>{countFor(t.id)}</small>
            </button>
          ))}
        </div>
      )}
      <div className="bo-row">
        <input
          className="bo-input"
          placeholder={inJournal ? "Chercher une action, une cible" : "Chercher un nom, un texte"}
          aria-label="Chercher dans l’activité"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="bo-input bo-narrow"
          aria-label="Période"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          {PERIODS.map((p) => (
            <option key={p.days} value={p.days}>
              {p.label}
            </option>
          ))}
        </select>
        {!inJournal && (
          <select
            className="bo-input bo-narrow"
            aria-label="Visibilité"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as EventVisibility)}
          >
            <option value="all">Public et privé</option>
            <option value="public">Public</option>
            <option value="private">{kind === "roll" ? "Jets secrets" : "Privé"}</option>
          </select>
        )}
      </div>
      <p className="bo-muted">
        {shown.length} résultat{shown.length > 1 ? "s" : ""}
      </p>
      {shown.length === 0 && <p className="bo-empty">Rien avec ces filtres.</p>}
      {groups.map((g) => (
        <section key={g.day} className="bo-day">
          <h3>{g.day}</h3>
          <ul>
            {g.events.map((e) =>
              e.kind === "roll" ? (
                <RollRow key={e.id} event={e} showTeam={!teamId} />
              ) : e.kind === "message" ? (
                <MessageRow
                  key={e.id}
                  event={e}
                  showTeam={!teamId}
                  busy={busy}
                  onDelete={() => void askDelete(e)}
                />
              ) : (
                <JournalRow key={e.id} event={e} />
              ),
            )}
          </ul>
        </section>
      ))}
      {shown.length > limit && (
        <button type="button" className="bo-btn bo-more" onClick={() => setLimit(limit + PAGE)}>
          Afficher plus
        </button>
      )}
    </>
  );
}

function RollRow({ event: e, showTeam }: { event: AdminEvent; showTeam: boolean }) {
  const [dice, total] = e.detail.split(" → ");
  return (
    <li className="bo-roll">
      <time>{formatTime(e.at)}</time>
      <span className="bo-grow">
        <b>{e.who}</b>
        {e.text && <span> · {e.text}</span>}
        {showTeam && <small>{e.team}</small>}
      </span>
      {e.secret && <EyeOff size={14} aria-label="Jet secret" />}
      <span className="bo-muted">{dice}</span>
      <b className="bo-total">{total}</b>
    </li>
  );
}

function MessageRow({
  event: e,
  showTeam,
  busy,
  onDelete,
}: {
  event: AdminEvent;
  showTeam: boolean;
  busy: boolean;
  onDelete: () => void;
}) {
  return (
    <li className={`bo-msg ${e.secret ? "private" : ""}`}>
      <div className="bo-msg-head">
        <time>{formatTime(e.at)}</time>
        <b>{e.who}</b>
        <i className="bo-tag">
          {e.detail === "Annonce" && <Megaphone size={11} aria-hidden="true" />} {e.detail}
        </i>
        {showTeam && <small className="bo-muted">{e.team}</small>}
        <button
          type="button"
          className="bo-btn bo-icon"
          aria-label={`Supprimer le message de ${e.who}`}
          title="Supprimer le message"
          disabled={busy}
          onClick={onDelete}
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </div>
      <p className="bo-text">{e.text}</p>
    </li>
  );
}

const CATEGORY_LABEL = {
  comptes: "Compte",
  equipes: "Équipe",
  fiches: "Fiche",
  support: "Support",
  reglages: "Réglage",
} as const;

function JournalRow({ event: e }: { event: AdminEvent }) {
  return (
    <li className="bo-log">
      <time>{formatTime(e.at)}</time>
      <i className="bo-tag">{CATEGORY_LABEL[logCategory(e.text)]}</i>
      <span className="bo-grow">
        {e.text}
        {e.detail && <small>{e.detail}</small>}
      </span>
    </li>
  );
}
