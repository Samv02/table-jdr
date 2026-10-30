import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Lock, MessageCircleReply, Send } from "lucide-react";
import { InlineError } from "@/components/InlineError";
import {
  adminReplyTicket,
  adminTicketThread,
  adminTickets,
  adminUpdateTicket,
  type AdminTicket,
  type AdminTicketMessage,
} from "@/lib/admin-support.functions";
import { formatMoment } from "@/lib/admin";
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  categoryLabel,
  sortTickets,
  statusLabel,
} from "@/lib/support";

const REFRESH_MS = 20000;

export function AdminSupport({ onChanged }: { onChanged: () => void }) {
  const load = useServerFn(adminTickets);
  const [tickets, setTickets] = useState<AdminTicket[] | null>(null);
  const [status, setStatus] = useState("open");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setTickets(await load());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Chargement impossible.");
    }
  }, [load]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const changed = async () => {
    await refresh();
    onChanged();
  };
  const q = search.trim().toLowerCase();
  const count = (key: string) => tickets?.filter((t) => t.status === key).length ?? 0;
  const shown = sortTickets(
    (tickets ?? []).filter(
      (t) =>
        t.status === status &&
        (!q || [t.subject, t.username, t.email, t.team].some((x) => x?.toLowerCase().includes(q))),
    ),
  );

  return (
    <>
      <InlineError message={err} onClear={() => setErr(null)} />
      <div className="bo-views" role="tablist" aria-label="État des tickets">
        {TICKET_STATUSES.map((s) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={status === s.key}
            className={status === s.key ? "on" : ""}
            onClick={() => {
              setStatus(s.key);
              setOpen(null);
            }}
          >
            {s.label} <small>{count(s.key)}</small>
          </button>
        ))}
      </div>
      <div className="bo-row">
        <input
          className="bo-input"
          placeholder="Chercher un sujet, un utilisateur, une équipe"
          aria-label="Chercher un ticket"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {tickets === null ? (
        <p className="bo-muted">Chargement…</p>
      ) : shown.length === 0 ? (
        <p className="bo-empty">Aucun ticket ici.</p>
      ) : (
        <ul className="bo-list">
          {shown.map((t) => (
            <li key={t.id} className={`bo-card ${t.awaiting ? "waiting" : ""}`}>
              <button
                type="button"
                className="bo-card-head"
                aria-expanded={open === t.id}
                onClick={() => setOpen(open === t.id ? null : t.id)}
              >
                <span className="bo-card-title">
                  <b>{t.subject}</b>
                  {t.awaiting && <i className="bo-tag warn">À répondre</i>}
                  {t.priority === "high" && <i className="bo-tag red">Priorité haute</i>}
                  <small>
                    {t.username ?? "Compte supprimé"} · {categoryLabel(t.category)}
                    {t.team ? ` · ${t.team}` : ""}
                  </small>
                </span>
                <small className="bo-card-side">{formatMoment(t.updated_at)}</small>
                <ChevronDown size={18} aria-hidden="true" />
              </button>
              {open === t.id && <TicketDetail ticket={t} onChanged={changed} onError={setErr} />}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function TicketDetail({
  ticket: t,
  onChanged,
  onError,
}: {
  ticket: AdminTicket;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const thread = useServerFn(adminTicketThread);
  const reply = useServerFn(adminReplyTicket);
  const update = useServerFn(adminUpdateTicket);
  const [messages, setMessages] = useState<AdminTicketMessage[] | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setMessages(await thread({ data: { id: t.id } }));
  }, [thread, t.id]);
  useEffect(() => {
    load().catch(() => onError("Lecture impossible."));
  }, [load, t.updated_at, onError]);

  async function act(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      await onChanged();
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Action impossible.");
    } finally {
      setBusy(false);
    }
  }
  const send = (internal: boolean) =>
    act(async () => {
      await reply({ data: { id: t.id, body, internal } });
      setBody("");
    });

  return (
    <div className="bo-detail">
      <p className="bo-muted">
        {t.email ?? "Compte supprimé"} · ouvert le {formatMoment(t.created_at)}
      </p>
      <div className="bo-row">
        <label className="bo-field">
          État
          <select
            className="bo-input"
            value={t.status}
            disabled={busy}
            onChange={(e) =>
              void act(() =>
                update({
                  data: {
                    id: t.id,
                    status: e.target.value as "open" | "in_progress" | "resolved",
                  },
                }),
              )
            }
          >
            {TICKET_STATUSES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="bo-field">
          Priorité
          <select
            className="bo-input"
            value={t.priority}
            disabled={busy}
            onChange={(e) =>
              void act(() =>
                update({
                  data: { id: t.id, priority: e.target.value as "low" | "normal" | "high" },
                }),
              )
            }
          >
            {TICKET_PRIORITIES.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ul className="bo-thread">
        {messages === null && <li className="bo-muted">Chargement…</li>}
        {messages?.map((m) => (
          <li key={m.id} className={m.internal ? "internal" : m.from_admin ? "mine" : ""}>
            <small>
              {m.internal && <Lock size={11} aria-hidden="true" />}{" "}
              {m.internal
                ? "Note interne"
                : m.from_admin
                  ? "Support"
                  : (t.username ?? "Utilisateur")}{" "}
              · {formatMoment(m.created_at)}
            </small>
            <p className="bo-text">{m.body}</p>
          </li>
        ))}
      </ul>
      <textarea
        className="bo-input bo-area"
        rows={4}
        maxLength={4000}
        placeholder="Ta réponse à l’utilisateur"
        aria-label="Réponse"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="bo-actions">
        <button
          type="button"
          className="bo-btn primary"
          disabled={busy || !body.trim()}
          onClick={() => void send(false)}
        >
          <Send size={16} aria-hidden="true" /> Répondre
        </button>
        <button
          type="button"
          className="bo-btn"
          disabled={busy || !body.trim()}
          title="Invisible pour l’utilisateur"
          onClick={() => void send(true)}
        >
          <Lock size={16} aria-hidden="true" /> Note interne
        </button>
        {t.status !== "resolved" && (
          <button
            type="button"
            className="bo-btn"
            disabled={busy}
            onClick={() => void act(() => update({ data: { id: t.id, status: "resolved" } }))}
          >
            <MessageCircleReply size={16} aria-hidden="true" /> Marquer{" "}
            {statusLabel("resolved").toLowerCase()}
          </button>
        )}
      </div>
    </div>
  );
}
