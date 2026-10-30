/**
 * MESSAGERIE — règles côté interface (le nom affiché vient de l'univers).
 * Elles reflètent exactement celles de la base (messagerie.sql) ; la base reste l'arbitre final.
 *
 *   "all"            Annonces : le MJ écrit, tout le monde lit
 *   "gm:<perso>"     Canal privé joueur <-> MJ, toujours ouvert
 *   "holo:<a>:<b>"   Échange privé entre deux personnages, si le MJ a autorisé la paire
 */
export type ChannelKind = "all" | "gm" | "holo";
export type Message = {
  id: string;
  channel: string;
  sender_user: string;
  sender_character: string | null;
  sender_name: string;
  body: string;
  created_at: string;
};
export type HoloLink = { a: string; b: string };
export type Member = {
  character_id: string;
  handle: string;
  color?: string;
  avatar?: string | null | undefined;
};
export type Conversation = {
  channel: string;
  kind: ChannelKind;
  title: string;
  subtitle: string;
  members: string[];
  canPost: boolean;
  allowed: boolean;
};

export const ALL = "all";
export const gmChannel = (characterId: string) => `gm:${characterId}`;
/** Les deux identifiants sont toujours triés : un seul canal par paire */
export function holoChannel(x: string, y: string) {
  const [a, b] = x < y ? [x, y] : [y, x];
  return `holo:${a}:${b}`;
}
export function parseChannel(ch: string): { kind: ChannelKind; ids: string[] } | null {
  if (ch === ALL) return { kind: "all", ids: [] };
  const [k, ...ids] = ch.split(":");
  if (k === "gm" && ids.length === 1) return { kind: "gm", ids };
  if (k === "holo" && ids.length === 2) return { kind: "holo", ids };
  return null;
}
export const isLinked = (links: HoloLink[], x: string, y: string) => {
  const [a, b] = x < y ? [x, y] : [y, x];
  return links.some((l) => l.a === a && l.b === b);
};

/** Liste des conversations visibles pour l'utilisateur, dans l'ordre d'affichage */
export function conversationsFor(opts: {
  isGm: boolean;
  myCharacter: string | null;
  members: Member[];
  links: HoloLink[];
  messages: Message[];
  announcements?: string;
}): Conversation[] {
  const { isGm, myCharacter, members, links, messages } = opts;
  const name = (id: string) => members.find((m) => m.character_id === id)?.handle ?? "?";
  const out: Conversation[] = [
    {
      channel: ALL,
      kind: "all",
      title: opts.announcements ?? "Annonces",
      subtitle: isGm ? "Diffusé à toute la table" : "Messages du MJ à toute la table",
      members: [],
      canPost: isGm,
      allowed: true,
    },
  ];
  if (isGm) {
    for (const m of members)
      out.push({
        channel: gmChannel(m.character_id),
        kind: "gm",
        title: m.handle,
        subtitle: "Canal privé avec le MJ",
        members: [m.character_id],
        canPost: true,
        allowed: true,
      });
    // Échanges autorisés + anciens échanges qui ont des messages
    const holo = new Set(links.map((l) => holoChannel(l.a, l.b)));
    for (const msg of messages) if (msg.channel.startsWith("holo:")) holo.add(msg.channel);
    for (const ch of holo) {
      const p = parseChannel(ch);
      if (!p) continue;
      const [a, b] = p.ids as [string, string];
      const allowed = isLinked(links, a, b);
      out.push({
        channel: ch,
        kind: "holo",
        title: `${name(a)} ↔ ${name(b)}`,
        subtitle: allowed ? "Échange autorisé" : "Échange coupé (historique)",
        members: [a, b],
        canPost: true,
        allowed,
      });
    }
    return out;
  }
  if (!myCharacter) return out;
  out.push({
    channel: gmChannel(myCharacter),
    kind: "gm",
    title: "MJ",
    subtitle: "Canal privé, toujours ouvert",
    members: [myCharacter],
    canPost: true,
    allowed: true,
  });
  for (const m of members) {
    if (m.character_id === myCharacter) continue;
    const ch = holoChannel(myCharacter, m.character_id);
    const allowed = isLinked(links, myCharacter, m.character_id);
    const hasHistory = messages.some((x) => x.channel === ch);
    out.push({
      channel: ch,
      kind: "holo",
      title: m.handle,
      subtitle: allowed
        ? "Échange disponible"
        : hasHistory
          ? "Échange coupé par le MJ"
          : "Non autorisé par le MJ",
      members: [myCharacter, m.character_id],
      canPost: allowed,
      allowed,
    });
  }
  return out;
}

/** Messages non lus d'un canal (les siens ne comptent pas) */
export function unreadCount(
  messages: Message[],
  channel: string,
  lastRead: string | undefined,
  me: string | null,
) {
  return messages.filter(
    (m) => m.channel === channel && m.sender_user !== me && (!lastRead || m.created_at > lastRead),
  ).length;
}

/** Toutes les paires possibles entre personnages (pour l'écran d'autorisations du MJ) */
export function allPairs(members: Member[]): [Member, Member][] {
  const out: [Member, Member][] = [];
  for (let i = 0; i < members.length; i++)
    for (let j = i + 1; j < members.length; j++) out.push([members[i]!, members[j]!]);
  return out;
}
export const MESSAGE_MAX = 2000;
