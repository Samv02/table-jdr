import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Lock,
  Megaphone,
  MessagesSquare,
  Radio,
  Send,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIdentity } from "@/lib/active-character";
import { useTable } from "@/lib/table-context";
import { Button } from "./ui/button";
import {
  MESSAGE_MAX,
  allPairs,
  conversationsFor,
  isLinked,
  unreadCount,
  type Conversation,
  type HoloLink,
  type Member,
  type Message,
} from "@/lib/messaging";
import { useWords } from "@/lib/universe-context";
import { InlineError } from "@/components/InlineError";
import { confirmAction } from "@/components/ConfirmDialog";

const readKey = (uid: string, team: string | null) => `holonet:read:${uid}:${team}`;
function loadRead(uid: string | null, team: string | null): Record<string, string> {
  if (!uid) return {};
  try {
    return JSON.parse(localStorage.getItem(readKey(uid, team)) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}
const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const KIND_ICON = { all: Megaphone, gm: ShieldCheck, holo: Radio } as const;

/**
 * MESSAGERIE de la table (tiroir à gauche). Son nom vient de l'univers.
 * Ouvert par l'évènement "comms:open" (bouton du HUD) ; publie le total de non-lus via "comms:unread".
 */
export function Comms() {
  const id = useIdentity();
  const W = useWords();
  const table = useTable();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"list" | "chat" | "perms">("list");
  const [active, setActive] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [links, setLinks] = useState<HoloLink[]>([]);
  const [lastRead, setLastRead] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const state = useRef({ open, view, active });
  state.current = { open, view, active };

  const members: Member[] = useMemo(
    () =>
      table.party
        .filter((p) => p.character_id !== "mj")
        .map((p) => ({
          character_id: p.character_id,
          handle: p.handle,
          color: p.color,
          avatar: p.avatar,
        })),
    [table.party],
  );
  const myCharacter = id.isGm ? null : (id.active?.id ?? null);
  const convs = useMemo(
    () =>
      conversationsFor({
        isGm: id.isGm,
        myCharacter,
        members,
        links,
        messages,
        announcements: W.announcements,
      }),
    [id.isGm, myCharacter, members, links, messages, W.announcements],
  );
  const current = convs.find((c) => c.channel === active) ?? null;

  // ---------- Chargement + temps réel ----------
  useEffect(() => {
    if (!id.userId) return;
    setLastRead(loadRead(id.userId, id.teamId));
    let alive = true;
    const loadMessages = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (!error && alive) setMessages(((data ?? []) as Message[]).reverse());
    };
    const loadLinks = async () => {
      const { data } = await supabase.from("holo_links").select("a,b");
      if (alive) setLinks((data ?? []) as HoloLink[]);
    };
    void loadMessages();
    void loadLinks();
    const ch = supabase
      .channel(`holonet-${id.userId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const m = payload.new as Message;
          setMessages((old) => (old.some((x) => x.id === m.id) ? old : [...old, m]));
          // Pas de pop-up : le bouton de messagerie clignote et affiche le nombre de non-lus.
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages" },
        (payload) => {
          const old = payload.old as { id?: string };
          setMessages((list) => list.filter((x) => x.id !== old.id));
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "holo_links" },
        () => void loadLinks(),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void loadMessages();
          void loadLinks();
        }
      });
    const show = () => {
      setOpen(true);
      setView("list");
    };
    window.addEventListener("comms:open", show);
    return () => {
      alive = false;
      void supabase.removeChannel(ch);
      window.removeEventListener("comms:open", show);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id.userId, id.teamId]);

  // Non-lus : total publié pour le badge du HUD
  const unread = (ch: string) => unreadCount(messages, ch, lastRead[ch], id.userId);
  const total = convs.reduce((n, c) => n + unread(c.channel), 0);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("comms:unread", { detail: total }));
  }, [total]);

  // Conversation ouverte : marquée comme lue + défilement en bas
  useEffect(() => {
    if (!open || view !== "chat" || !active || !id.userId) return;
    const last = messages.filter((m) => m.channel === active).at(-1)?.created_at;
    if (last && lastRead[active] !== last) {
      const next = { ...lastRead, [active]: last };
      setLastRead(next);
      try {
        localStorage.setItem(readKey(id.userId, id.teamId), JSON.stringify(next));
      } catch {
        /* stockage indisponible */
      }
    }
    requestAnimationFrame(() => {
      const el = scroller.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [open, view, active, messages, id.userId, id.teamId, lastRead]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state.current.open) setOpen(false);
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);

  function openChannel(ch: string) {
    setOpen(true);
    setActive(ch);
    setView("chat");
  }

  async function send() {
    const body = draft.trim();
    if (!body || !current?.canPost || sending) return;
    setSending(true);
    const { data, error } = await supabase
      .from("messages")
      .insert({ channel: current.channel, body })
      .select("*")
      .single();
    setSending(false);
    if (error)
      return void setErr(
        current.kind === "holo"
          ? "Échange coupé : le MJ n'autorise plus cette conversation."
          : `Message non envoyé : ${error.message}`,
      );
    setDraft("");
    if (data)
      setMessages((old) =>
        old.some((x) => x.id === (data as Message).id) ? old : [...old, data as Message],
      );
  }
  async function remove(m: Message) {
    const preview = m.body.length > 60 ? `${m.body.slice(0, 60)}…` : m.body;
    if (
      !(await confirmAction({
        title: "Supprimer ce message ?",
        message: `${m.sender_name} : « ${preview} »\nIl disparaîtra pour tout le monde.`,
      }))
    )
      return;
    const { error } = await supabase.from("messages").delete().eq("id", m.id);
    if (error) setErr(error.message);
    else setMessages((l) => l.filter((x) => x.id !== m.id));
  }
  async function setLink(x: string, y: string, on: boolean) {
    const [a, b] = x < y ? [x, y] : [y, x];
    const { error } = on
      ? await supabase.from("holo_links").insert({ a, b })
      : await supabase.from("holo_links").delete().eq("a", a).eq("b", b);
    if (error) return void setErr(error.message);
    setLinks((old) =>
      on
        ? [...old.filter((l) => !(l.a === a && l.b === b)), { a, b }]
        : old.filter((l) => !(l.a === a && l.b === b)),
    );
  }
  async function setAllLinks(on: boolean) {
    const pairs = allPairs(members).map(([p, q]) =>
      p.character_id < q.character_id
        ? { a: p.character_id, b: q.character_id }
        : { a: q.character_id, b: p.character_id },
    );
    if (
      !on &&
      !(await confirmAction({
        title: `Couper tous les ${W.privateCalls.toLowerCase()} ?`,
        message:
          "Plus aucun joueur ne pourra écrire à un autre joueur. L'historique reste visible.",
        confirmLabel: "Tout couper",
      }))
    )
      return;
    const { error } = on
      ? await supabase
          .from("holo_links")
          .upsert(pairs, { onConflict: "a,b", ignoreDuplicates: true })
      : await supabase.from("holo_links").delete().not("a", "is", null);
    if (error) return void setErr(error.message);
    setLinks(on ? pairs : []);
  }

  if (!id.userId) return null;
  const member = (cid: string | null) => members.find((m) => m.character_id === cid);
  const chatMessages = active ? messages.filter((m) => m.channel === active) : [];

  return (
    <>
      {/* Bouton flottant en bas à gauche, fixe à l'écran (pendant du bouton de dés en bas à droite) */}
      <button
        type="button"
        className={`comms-fab ${total > 0 ? "ping" : ""} ${open ? "hide" : ""}`}
        aria-label={`${W.messaging}${total ? ` (${total} non lu${total > 1 ? "s" : ""})` : ""}`}
        title={W.messaging}
        onClick={() => {
          setOpen(true);
          setView("list");
        }}
      >
        <MessagesSquare />
        <span className="comms-fab-label">{W.messaging.toUpperCase()}</span>
        {total > 0 && <span className="badge">{total}</span>}
      </button>
      <div className={`scrim comms-scrim ${open ? "on" : ""}`} onClick={() => setOpen(false)} />
      <aside className={`comms ${open ? "open" : ""}`} inert={!open} aria-label={W.messaging}>
        <header className="comms-head">
          {view !== "list" && (
            <Button
              variant="prototype"
              className="icon-btn cut-s"
              aria-label="Retour"
              onClick={() => setView("list")}
            >
              <ArrowLeft size={18} />
            </Button>
          )}
          <div className="comms-title">
            {view === "chat" && current ? (
              <>
                <b className={`k-${current.kind}`}>
                  {current.kind === "holo"
                    ? W.privateCall.toUpperCase()
                    : current.kind === "gm"
                      ? "CANAL MJ"
                      : W.announcements.toUpperCase()}
                </b>
                <span>{current.title}</span>
              </>
            ) : view === "perms" ? (
              <>
                <b className="k-holo">{W.privateCall.toUpperCase()}</b>
                <span>Autorisations</span>
              </>
            ) : (
              <>
                <b>{W.messaging.toUpperCase()}</b>
                <span className="live">EN LIGNE</span>
              </>
            )}
          </div>
          <Button
            variant="prototype"
            className="icon-btn cut-s"
            aria-label="Fermer"
            onClick={() => setOpen(false)}
          >
            <X size={18} />
          </Button>
        </header>
        <InlineError message={err} onClear={() => setErr(null)} />

        {view === "list" && (
          <div className="comms-list">
            {id.isGm && (
              <Button
                variant="prototype"
                className="conv perms-entry cut-s"
                onClick={() => setView("perms")}
              >
                <Radio size={18} />
                <span className="conv-txt">
                  <b>Autoriser les {W.privateCalls.toLowerCase()}</b>
                  <small>
                    {links.length} paire{links.length > 1 ? "s" : ""} autorisée
                    {links.length > 1 ? "s" : ""}
                  </small>
                </span>
              </Button>
            )}
            {!id.isGm && !myCharacter && (
              <p className="note">
                Aucun personnage assigné : demande au MJ pour accéder aux messages.
              </p>
            )}
            {groups(convs, id.isGm, W).map(([label, list]) =>
              list.length ? (
                <div key={label} className="conv-group">
                  <h3>{label}</h3>
                  {list.map((c) => (
                    <ConvRow
                      key={c.channel}
                      c={c}
                      unread={unread(c.channel)}
                      last={messages.filter((m) => m.channel === c.channel).at(-1)}
                      member={
                        c.members.length === 1
                          ? member(c.members[0]!)
                          : c.kind === "holo" && !id.isGm
                            ? member(c.members.find((x) => x !== myCharacter) ?? null)
                            : undefined
                      }
                      onOpen={() => openChannel(c.channel)}
                    />
                  ))}
                </div>
              ) : null,
            )}
          </div>
        )}

        {view === "chat" && current && (
          <>
            <p className={`chat-sub k-${current.kind}`}>
              {current.kind === "holo" && !current.allowed ? (
                <>
                  <Lock size={12} /> {current.subtitle}
                </>
              ) : (
                current.subtitle
              )}
            </p>
            <div className={`chat ${current.kind === "holo" ? "holo" : ""}`} ref={scroller}>
              {chatMessages.length ? (
                chatMessages.map((m) => {
                  const mine = m.sender_user === id.userId;
                  const gm = m.sender_name === "MJ" && !m.sender_character;
                  const who = member(m.sender_character);
                  return (
                    <div
                      key={m.id}
                      className={`msg ${mine ? "mine" : ""} ${gm ? "gm" : ""}`}
                      style={
                        {
                          "--c": gm
                            ? "var(--yellow)"
                            : who?.color
                              ? `var(--${who.color === "orange" ? "neon-orange" : who.color})`
                              : "var(--cyan)",
                        } as React.CSSProperties
                      }
                    >
                      {!mine && (
                        <div className="msg-av">
                          {who?.avatar ? (
                            <img src={who.avatar} alt="" />
                          ) : (
                            <b>{gm ? "MJ" : m.sender_name.slice(0, 2).toUpperCase()}</b>
                          )}
                        </div>
                      )}
                      <div className="bubble">
                        <div className="msg-meta">
                          <b>{mine ? "Toi" : m.sender_name}</b>
                          <span>{hhmm(m.created_at)}</span>
                          {id.isGm && (
                            <button
                              className="msg-del"
                              aria-label="Supprimer ce message"
                              onClick={() => void remove(m)}
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                        <p>{m.body}</p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="note chat-empty">
                  {current.kind === "holo"
                    ? "Aucun message pour l'instant."
                    : current.kind === "gm"
                      ? id.isGm
                        ? "Aucun message de ce joueur."
                        : "Écris au MJ : question, action secrète, demande de règle…"
                      : "Aucune annonce pour l'instant."}
                </p>
              )}
            </div>
            {current.canPost ? (
              <form
                className="composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <textarea
                  className="field"
                  rows={2}
                  maxLength={MESSAGE_MAX}
                  value={draft}
                  placeholder={
                    current.kind === "all"
                      ? "Annonce à toute la table…"
                      : current.kind === "holo"
                        ? "Message…"
                        : id.isGm
                          ? "Répondre en privé…"
                          : "Message privé au MJ…"
                  }
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                <Button
                  variant="prototype"
                  className="btn y send cut-s"
                  aria-label="Envoyer"
                  disabled={!draft.trim() || sending}
                >
                  <Send size={18} />
                </Button>
              </form>
            ) : (
              <p className="composer locked">
                <Lock size={14} />{" "}
                {current.kind === "all"
                  ? "Seul le MJ peut écrire ici."
                  : "Le MJ n'a pas autorisé cet échange."}
              </p>
            )}
          </>
        )}

        {view === "perms" && id.isGm && (
          <div className="comms-list perms">
            {(() => {
              const total = allPairs(members).length;
              const isolated = members.filter(
                (p) =>
                  !members.some((q) => q !== p && isLinked(links, p.character_id, q.character_id)),
              ).length;
              return (
                <div className="perms-top">
                  <div className="perms-summary">
                    <b>{links.length}</b>
                    <span>
                      /{total} ligne{total > 1 ? "s" : ""} ouverte{links.length > 1 ? "s" : ""}
                    </span>
                    {isolated > 0 && (
                      <em>
                        {isolated} isolé{isolated > 1 ? "s" : ""}
                      </em>
                    )}
                  </div>
                  <div className="perms-global">
                    <Button
                      variant="prototype"
                      className="btn"
                      disabled={links.length === total}
                      onClick={() => void setAllLinks(true)}
                    >
                      Tout ouvrir
                    </Button>
                    <Button
                      variant="prototype"
                      className="btn red"
                      disabled={links.length === 0}
                      onClick={() => void setAllLinks(false)}
                    >
                      Tout couper
                    </Button>
                  </div>
                </div>
              );
            })()}
            {members.map((p) => {
              const others = members.filter((q) => q.character_id !== p.character_id);
              const linked = others.filter((q) => isLinked(links, p.character_id, q.character_id));
              const c = p.color
                ? `var(--${p.color === "orange" ? "neon-orange" : p.color})`
                : "var(--cyan)";
              return (
                <div
                  key={p.character_id}
                  className={`pnode cut-s ${linked.length ? "" : "isolated"}`}
                  style={{ "--c": c } as React.CSSProperties}
                >
                  <div className="pnode-head">
                    <span className="pnode-av">
                      {p.avatar ? (
                        <img src={p.avatar} alt="" />
                      ) : (
                        <b>{p.handle.slice(0, 2).toUpperCase()}</b>
                      )}
                    </span>
                    <span className="pnode-name">
                      <b>{p.handle}</b>
                      <small>
                        {linked.length
                          ? `${linked.length}/${others.length} contact${linked.length > 1 ? "s" : ""}`
                          : "Isolé · ne peut joindre que le MJ"}
                      </small>
                    </span>
                    <span className="pnode-all">
                      <Button
                        variant="prototype"
                        className="mini"
                        title={`${p.handle} peut joindre tout le monde`}
                        disabled={linked.length === others.length}
                        onClick={() => {
                          for (const q of others)
                            if (!isLinked(links, p.character_id, q.character_id))
                              void setLink(p.character_id, q.character_id, true);
                        }}
                      >
                        Tous
                      </Button>
                      <Button
                        variant="prototype"
                        className="mini"
                        title={`Isoler ${p.handle}`}
                        disabled={!linked.length}
                        onClick={() => {
                          for (const q of linked)
                            void setLink(p.character_id, q.character_id, false);
                        }}
                      >
                        Aucun
                      </Button>
                    </span>
                  </div>
                  <div className="pnode-chips">
                    {others.map((q) => {
                      const on = isLinked(links, p.character_id, q.character_id);
                      return (
                        <button
                          type="button"
                          key={q.character_id}
                          className={`pchip ${on ? "on" : ""}`}
                          aria-pressed={on}
                          title={
                            on
                              ? `Couper ${p.handle} ↔ ${q.handle}`
                              : `Autoriser ${p.handle} ↔ ${q.handle}`
                          }
                          onClick={() => void setLink(p.character_id, q.character_id, !on)}
                        >
                          {on ? <Radio size={13} /> : <Lock size={12} />}
                          {q.handle}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {members.length < 2 ? (
              <p className="note">Il faut au moins deux personnages assignés.</p>
            ) : (
              <p className="note perms-help">
                Touche un nom pour ouvrir ou couper la ligne. Une autorisation vaut dans les deux
                sens. Tu vois et peux écrire dans tous les {W.privateCalls.toLowerCase()}, même
                coupés.
              </p>
            )}
          </div>
        )}
      </aside>
    </>
  );
}

function groups(
  convs: Conversation[],
  isGm: boolean,
  W: { announcements: string; privateCalls: string },
): [string, Conversation[]][] {
  return [
    [W.announcements, convs.filter((c) => c.kind === "all")],
    [isGm ? "Canaux privés des joueurs" : "MJ", convs.filter((c) => c.kind === "gm")],
    [W.privateCalls, convs.filter((c) => c.kind === "holo")],
  ];
}

function ConvRow({
  c,
  unread,
  last,
  member,
  onOpen,
}: {
  c: Conversation;
  unread: number;
  last: Message | undefined;
  member: Member | undefined;
  onOpen: () => void;
}) {
  const Icon = KIND_ICON[c.kind];
  return (
    <Button
      variant="prototype"
      className={`conv cut-s k-${c.kind} ${c.allowed ? "" : "off"} ${unread ? "has-unread" : ""}`}
      onClick={onOpen}
    >
      <span className="conv-av">
        {member?.avatar ? (
          <img src={member.avatar} alt="" />
        ) : c.kind === "gm" && !member ? (
          <UserRound size={18} />
        ) : (
          <Icon size={18} />
        )}
      </span>
      <span className="conv-txt">
        <b>{c.title}</b>
        <small>{last ? `${last.sender_name} : ${last.body}` : c.subtitle}</small>
      </span>
      {!c.allowed && <Lock size={14} className="conv-lock" />}
      {unread > 0 && <span className="badge">{unread}</span>}
    </Button>
  );
}
