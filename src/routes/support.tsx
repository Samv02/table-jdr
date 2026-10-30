import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Plus, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { InlineError } from "@/components/InlineError";
import { useIdentity } from "@/lib/active-character";
import { formatMoment } from "@/lib/admin";
import { TICKET_CATEGORIES, categoryLabel, statusLabel, validateTicket } from "@/lib/support";

export const Route = createFileRoute("/support")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Support" },
      { name: "description", content: "Demande de l’aide et suis tes demandes." },
    ],
  }),
  component: SupportPage,
});

type Ticket = {
  id: string;
  subject: string;
  category: string;
  status: string;
  user_unread: boolean;
  updated_at: string;
};
type Message = { id: string; from_admin: boolean; body: string; created_at: string };

function SupportPage() {
  const id = useIdentity();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("support_tickets")
      .select("id,subject,category,status,user_unread,updated_at")
      .order("updated_at", { ascending: false });
    if (error) return setErr(error.message);
    setTickets(data);
  }, []);
  useEffect(() => {
    if (id.userId) void load();
  }, [id.userId, load]);

  if (id.ready && !id.userId)
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Link to="/" className="text-accent underline">
          Connecte-toi d’abord
        </Link>
      </main>
    );

  const current = tickets?.find((t) => t.id === open) ?? null;
  return (
    <main>
      <div className="wrap support-page">
        <div className="ph">
          <h1>SUPPORT</h1>
        </div>
        <InlineError message={err} onClear={() => setErr(null)} />
        {current ? (
          <Thread
            ticket={current}
            onBack={() => {
              setOpen(null);
              void load();
            }}
            onChanged={load}
            onError={setErr}
          />
        ) : creating ? (
          <NewTicket
            onCancel={() => setCreating(false)}
            onCreated={async (ticket) => {
              setCreating(false);
              await load();
              setOpen(ticket);
            }}
          />
        ) : (
          <>
            <p className="note">
              Un problème, une question ? Écris-nous : la réponse arrive ici, sur cette page.
            </p>
            <button type="button" className="bo-btn primary" onClick={() => setCreating(true)}>
              <Plus size={16} aria-hidden="true" /> Nouvelle demande
            </button>
            <ul className="bo-list support-list">
              {tickets?.length === 0 && <li className="note">Aucune demande pour l’instant.</li>}
              {tickets?.map((t) => (
                <li key={t.id} className="bo-card">
                  <button type="button" className="bo-card-head" onClick={() => setOpen(t.id)}>
                    <span className="bo-card-title">
                      <b>{t.subject}</b>
                      {t.user_unread && <i className="bo-tag warn">Nouvelle réponse</i>}
                      <small>
                        {categoryLabel(t.category)} · {formatMoment(t.updated_at)}
                      </small>
                    </span>
                    <i className={`bo-tag ${t.status === "resolved" ? "" : "warn"}`}>
                      {statusLabel(t.status)}
                    </i>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}

function NewTicket({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (id: string) => Promise<void>;
}) {
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("question");
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const invalid = validateTicket(subject, body);
    if (invalid) return setErr(invalid);
    setBusy(true);
    const { data, error } = await supabase.rpc("open_ticket", {
      _subject: subject,
      _category: category,
      _body: body,
    });
    setBusy(false);
    if (error) return setErr(error.message);
    await onCreated(data);
  }

  return (
    <form
      className="bo-card bo-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <InlineError message={err} onClear={() => setErr(null)} />
      <input
        className="bo-input"
        placeholder="Titre de ta demande"
        aria-label="Titre de ta demande"
        maxLength={120}
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
      />
      <select
        className="bo-input"
        aria-label="Sujet"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
      >
        {TICKET_CATEGORIES.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </select>
      <textarea
        className="bo-input bo-area"
        rows={6}
        maxLength={4000}
        placeholder="Explique ce qui se passe"
        aria-label="Description"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="bo-actions">
        <button type="submit" className="bo-btn primary" disabled={busy}>
          <Send size={16} aria-hidden="true" /> Envoyer
        </button>
        <button type="button" className="bo-btn" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </form>
  );
}

function Thread({
  ticket: t,
  onBack,
  onChanged,
  onError,
}: {
  ticket: Ticket;
  onBack: () => void;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("support_messages")
      .select("id,from_admin,body,created_at")
      .eq("ticket_id", t.id)
      .order("created_at");
    setMessages(data ?? []);
    await supabase.rpc("mark_ticket_read", { _ticket: t.id });
  }, [t.id]);
  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`support-${t.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `ticket_id=eq.${t.id}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, t.id]);

  async function send() {
    setBusy(true);
    const { error } = await supabase.rpc("reply_ticket", { _ticket: t.id, _body: body });
    setBusy(false);
    if (error) return onError(error.message);
    setBody("");
    await load();
    await onChanged();
  }
  async function close() {
    const { error } = await supabase.rpc("close_ticket", { _ticket: t.id });
    if (error) return onError(error.message);
    await onChanged();
  }

  return (
    <div className="bo-card bo-form">
      <button type="button" className="bo-btn support-back" onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" /> Mes demandes
      </button>
      <h2>{t.subject}</h2>
      <p className="note">
        {categoryLabel(t.category)} · {statusLabel(t.status)}
      </p>
      <ul className="bo-thread">
        {messages.map((m) => (
          <li key={m.id} className={m.from_admin ? "" : "mine"}>
            <small>
              {m.from_admin ? "Support" : "Toi"} · {formatMoment(m.created_at)}
            </small>
            <p className="bo-text">{m.body}</p>
          </li>
        ))}
      </ul>
      <textarea
        className="bo-input bo-area"
        rows={3}
        maxLength={4000}
        placeholder={t.status === "resolved" ? "Répondre rouvre ta demande" : "Ta réponse"}
        aria-label="Ta réponse"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="bo-actions">
        <button
          type="button"
          className="bo-btn primary"
          disabled={busy || !body.trim()}
          onClick={() => void send()}
        >
          <Send size={16} aria-hidden="true" /> Envoyer
        </button>
        {t.status !== "resolved" && (
          <button type="button" className="bo-btn" onClick={() => void close()}>
            Mon problème est réglé
          </button>
        )}
      </div>
    </div>
  );
}
