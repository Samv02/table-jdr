import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  Ban,
  Check,
  Dices,
  EyeOff,
  Flag,
  Megaphone,
  MessageSquare,
  ScrollText,
  Trash2,
} from "lucide-react";
import { confirmAction } from "@/components/ConfirmDialog";
import { adminDeleteMessage, adminReviewMessage } from "@/lib/admin-platform.functions";
import { adminSetSuspended, type AdminEvent, type AdminTeam } from "@/lib/admin.functions";
import {
  categoryName,
  findFlags,
  splitFlags,
  type FlagMatch,
  type ModerationWord,
} from "@/lib/moderation";
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
import { Button } from "@/components/ui/button";

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
  words,
  flaggedOnly,
  busy,
  run,
}: {
  events: AdminEvent[];
  teams: AdminTeam[];
  words: ModerationWord[];
  flaggedOnly: boolean;
  busy: boolean;
  run: AdminRun;
}) {
  const removeMessage = useServerFn(adminDeleteMessage);
  const review = useServerFn(adminReviewMessage);
  const suspend = useServerFn(adminSetSuspended);
  const [kind, setKind] = useState<EventKind>(flaggedOnly ? "message" : "roll");
  const [teamId, setTeamId] = useState("");
  const [days, setDays] = useState(0);
  const [visibility, setVisibility] = useState<EventVisibility>(flaggedOnly ? "flagged" : "all");
  const [category, setCategory] = useState<LogCategory>("all");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const inJournal = kind === "admin";
  const flagsOf = useMemo(() => {
    const map = new Map<string, FlagMatch[]>();
    for (const e of events) {
      if (e.kind !== "message") continue;
      const found = findFlags(e.text, words);
      if (found.length) map.set(e.id, found);
    }
    return map;
  }, [events, words]);
  const shown = useMemo(
    () =>
      filterEvents(visibility === "flagged" ? events.filter((e) => flagsOf.has(e.id)) : events, {
        kind,
        teamId: inJournal ? "" : teamId,
        days,
        visibility: inJournal ? "all" : visibility,
        category: inJournal ? category : "all",
        search,
        now: Date.now(),
      }),
    [events, flagsOf, kind, inJournal, teamId, days, visibility, category, search],
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
  async function askSuspend(e: AdminEvent) {
    const userId = e.senderId;
    if (!userId) return;
    const ok = await confirmAction({
      title: `Suspendre « ${e.who} » ?`,
      message: "Plus aucun accès aux équipes jusqu’à sa réactivation. Rien n’est supprimé.",
      confirmLabel: "Suspendre",
    });
    if (ok)
      await run(() => suspend({ data: { userId, suspended: true } }), `${e.who} est suspendu.`);
  }

  return (
    <>
      <div className="bo-views" role="tablist" aria-label="Type d’activité">
        {VIEWS.map(({ key, label, icon: Icon }) => (
          <Button
            key={key}
            role="tab"
            aria-selected={kind === key}
            className={kind === key ? "on" : ""}
            onClick={() => {
              setKind(key);
              setLimit(PAGE);
              if (visibility === "flagged" && key !== "message") setVisibility("all");
            }}
          >
            <Icon size={16} aria-hidden="true" /> {label}
          </Button>
        ))}
      </div>
      {inJournal ? (
        <div className="bo-filters">
          {CATEGORIES.map((c) => (
            <Button
              key={c.key}
              className={`bo-chip ${category === c.key ? "on" : ""}`}
              aria-pressed={category === c.key}
              onClick={() => setCategory(c.key)}
            >
              {c.label}
            </Button>
          ))}
        </div>
      ) : (
        <div className="bo-filters" aria-label="Filtrer par équipe">
          <Button
            className={`bo-chip ${teamId === "" ? "on" : ""}`}
            aria-pressed={teamId === ""}
            onClick={() => setTeamId("")}
          >
            Toutes les équipes
          </Button>
          {teams.map((t) => (
            <Button
              key={t.id}
              className={`bo-chip ${teamId === t.id ? "on" : ""}`}
              aria-pressed={teamId === t.id}
              onClick={() => setTeamId(t.id)}
            >
              {t.name} <small>{countFor(t.id)}</small>
            </Button>
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
            {kind === "message" && <option value="flagged">Signalés ({flagsOf.size})</option>}
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
                  flags={flagsOf.get(e.id) ?? []}
                  onDelete={() => void askDelete(e)}
                  onSuspend={() => void askSuspend(e)}
                  onReview={() => void run(() => review({ data: { id: e.rawId } }))}
                />
              ) : (
                <JournalRow key={e.id} event={e} />
              ),
            )}
          </ul>
        </section>
      ))}
      {shown.length > limit && (
        <Button className="bo-btn bo-more" onClick={() => setLimit(limit + PAGE)}>
          Afficher plus
        </Button>
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
  flags,
  onDelete,
  onSuspend,
  onReview,
}: {
  event: AdminEvent;
  showTeam: boolean;
  busy: boolean;
  flags: FlagMatch[];
  onDelete: () => void;
  onSuspend: () => void;
  onReview: () => void;
}) {
  const flagged = flags.length > 0;
  const families = [...new Set(flags.map((f) => categoryName(f.category)))].join(", ");
  return (
    <li className={`bo-msg ${e.secret ? "private" : ""} ${flagged ? "flagged" : ""}`}>
      <div className="bo-msg-head">
        <time>{formatTime(e.at)}</time>
        <b>{e.who}</b>
        <i className="bo-tag">
          {e.detail === "Annonce" && <Megaphone size={11} aria-hidden="true" />} {e.detail}
        </i>
        {showTeam && <small className="bo-muted">{e.team}</small>}
        {flagged && (
          <i className="bo-tag red">
            <Flag size={11} aria-hidden="true" /> {families}
          </i>
        )}
        {flagged && e.reviewed && <i className="bo-tag">Vu</i>}
        <span className="bo-msg-tools">
          {flagged && !e.reviewed && (
            <Button
              className="bo-btn bo-icon"
              aria-label={`Marquer vu le message de ${e.who}`}
              title="Marquer vu"
              disabled={busy}
              onClick={onReview}
            >
              <Check size={14} aria-hidden="true" />
            </Button>
          )}
          {flagged && e.senderId && (
            <Button
              className="bo-btn bo-icon danger"
              aria-label={`Suspendre ${e.who}`}
              title="Suspendre l’auteur"
              disabled={busy}
              onClick={onSuspend}
            >
              <Ban size={14} aria-hidden="true" />
            </Button>
          )}
          <Button
            className="bo-btn bo-icon"
            aria-label={`Supprimer le message de ${e.who}`}
            title="Supprimer le message"
            disabled={busy}
            onClick={onDelete}
          >
            <Trash2 size={14} aria-hidden="true" />
          </Button>
        </span>
      </div>
      <p className="bo-text">
        {splitFlags(e.text, flags).map((part, i) =>
          part.flagged ? (
            <mark key={i} className="bo-flag">
              {part.text}
            </mark>
          ) : (
            <span key={i}>{part.text}</span>
          ),
        )}
      </p>
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
