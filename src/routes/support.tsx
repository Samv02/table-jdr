import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Bug, ChevronRight, CircleHelp, Send, Sparkles, UserCog } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { InlineError } from "@/components/InlineError";
import { useIdentity } from "@/lib/active-character";
import { formatMoment } from "@/lib/admin";
import { TICKET_CATEGORIES, categoryLabel, statusLabel, validateTicket } from "@/lib/support";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/support")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Aide" },
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

const CATEGORY_ICONS: Record<(typeof TICKET_CATEGORIES)[number]["key"], typeof Bug> = {
  question: CircleHelp,
  compte: UserCog,
  bug: Bug,
  autre: Sparkles,
};

function SupportPage() {
  const id = useIdentity();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
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
      <div className="wrap hub acct support-page">
        <header className="hub-head">
          <p className="hub-hello">La réponse arrive ici, sur cette page</p>
          <h1>Aide</h1>
        </header>
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
            category={creating}
            onCancel={() => setCreating(null)}
            onCreated={async (ticket) => {
              setCreating(null);
              await load();
              setOpen(ticket);
            }}
          />
        ) : (
          <>
            <h2 className="help-title">De quoi as-tu besoin ?</h2>
            <ul className="help-doors">
              {TICKET_CATEGORIES.map((c) => {
                const Icon = CATEGORY_ICONS[c.key];
                return (
                  <li key={c.key}>
                    <Button onClick={() => setCreating(c.key)}>
                      <span aria-hidden="true">
                        <Icon size={20} />
                      </span>
                      <b>{c.label}</b>
                      <small>{c.hint}</small>
                    </Button>
                  </li>
                );
              })}
            </ul>
            <h2 className="help-title">Mes demandes</h2>
            {tickets?.length === 0 && <p className="help-none">Aucune demande pour l’instant.</p>}
            <ul className="help-list">
              {tickets?.map((t) => (
                <li key={t.id} className={t.user_unread ? "unread" : ""}>
                  <Button onClick={() => setOpen(t.id)}>
                    <span>
                      <b>{t.subject}</b>
                      <small>
                        {categoryLabel(t.category)} · {formatMoment(t.updated_at)}
                      </small>
                    </span>
                    {t.user_unread && <i className="help-new">Nouvelle réponse</i>}
                    <i className={`help-status ${t.status}`}>{statusLabel(t.status)}</i>
                    <ChevronRight size={18} aria-hidden="true" />
                  </Button>
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
  category: start,
  onCancel,
  onCreated,
}: {
  category: string;
  onCancel: () => void;
  onCreated: (id: string) => Promise<void>;
}) {
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState(start);
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ask = TICKET_CATEGORIES.find((c) => c.key === category)?.ask ?? "";

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
      className="help-panel"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h2>{ask}</h2>
      <InlineError message={err} onClear={() => setErr(null)} />
      <div className="help-chips" role="radiogroup" aria-label="Sujet">
        {TICKET_CATEGORIES.map((c) => (
          <Button
            key={c.key}
            role="radio"
            aria-checked={category === c.key}
            className={category === c.key ? "on" : ""}
            onClick={() => setCategory(c.key)}
          >
            {c.label}
          </Button>
        ))}
      </div>
      <input
        className="field"
        placeholder="En quelques mots"
        aria-label="Titre de ta demande"
        maxLength={120}
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
      />
      <textarea
        className="field"
        rows={6}
        maxLength={4000}
        placeholder="Explique ce qui se passe"
        aria-label="Description"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="help-actions">
        <Button className="btn" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" className="btn y" disabled={busy}>
          <Send size={16} aria-hidden="true" /> Envoyer
        </Button>
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
    <div className="help-panel">
      <Button className="help-back" onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" /> Mes demandes
      </Button>
      <div className="help-thread-head">
        <h2>{t.subject}</h2>
        <i className={`help-status ${t.status}`}>{statusLabel(t.status)}</i>
      </div>
      <ul className="help-thread">
        {messages.map((m) => (
          <li key={m.id} className={m.from_admin ? "" : "mine"}>
            <p>{m.body}</p>
            <small>
              {m.from_admin ? "Support" : "Toi"} · {formatMoment(m.created_at)}
            </small>
          </li>
        ))}
      </ul>
      <textarea
        className="field"
        rows={3}
        maxLength={4000}
        placeholder={t.status === "resolved" ? "Répondre rouvre ta demande" : "Ta réponse"}
        aria-label="Ta réponse"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="help-actions">
        {t.status !== "resolved" && (
          <Button className="btn" onClick={() => void close()}>
            Mon problème est réglé
          </Button>
        )}
        <Button className="btn y" disabled={busy || !body.trim()} onClick={() => void send()}>
          <Send size={16} aria-hidden="true" /> Envoyer
        </Button>
      </div>
    </div>
  );
}
