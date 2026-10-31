import { normalizeUniverse, type Universe } from "./universe";

export type HubRow = {
  id: string;
  name: string;
  role: string;
  members: number;
  sheets: number;
  characters: string[];
  universe: unknown;
  scene: string | null;
  last_opened_at: string | null;
  last_activity: string | null;
  next_session: string | null;
};

export type HubTable = Omit<HubRow, "universe"> & { universe: Universe; isNew: boolean };

export const hubTable = (row: HubRow): HubTable => ({
  ...row,
  universe: normalizeUniverse(row.universe),
  isNew: !!row.last_activity && !!row.last_opened_at && row.last_activity > row.last_opened_at,
});

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** « il y a 3 jours », à partir des jours du calendrier et non de tranches de 24 h. */
export function sinceLabel(iso: string, now = new Date()) {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / DAY);
  if (days <= 0) return "aujourd’hui";
  if (days === 1) return "hier";
  return `il y a ${days} jours`;
}

/** Prochaine séance ; null dès qu'elle est passée, pour ne jamais afficher une date périmée. */
export function sessionLabel(iso: string | null, now = new Date()) {
  if (!iso) return null;
  const at = new Date(iso);
  if (at.getTime() < now.getTime()) return null;
  const time = at.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const days = Math.round((startOfDay(at) - startOfDay(now)) / DAY);
  if (days === 0) return `aujourd’hui à ${time}`;
  if (days === 1) return `demain à ${time}`;
  const day = at.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return `${day} à ${time}`;
}

/** Valeur attendue par un champ datetime-local, à l'heure de l'appareil. */
export function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/** Lien d'invitation : ouvert par quelqu'un sans compte, il survit à l'inscription. */
const INVITE_KEY = "table:invite";
export const inviteLink = (code: string, origin: string) =>
  `${origin}/rejoindre?code=${encodeURIComponent(code)}`;
export function keepInvite(code: string) {
  try {
    localStorage.setItem(INVITE_KEY, code);
  } catch {
    /* rien : le code reste affiché dans l'adresse */
  }
}
export function readInvite() {
  try {
    return localStorage.getItem(INVITE_KEY);
  } catch {
    return null;
  }
}
export function clearInvite() {
  try {
    localStorage.removeItem(INVITE_KEY);
  } catch {
    /* rien */
  }
}

export type SetupStep = { key: string; label: string; to: string; done: boolean };

/** Premiers pas d'une table : calculés depuis ses données, jamais à cocher à la main. */
export function setupSteps(t: {
  preset: string;
  tableNamed: boolean;
  sheets: number;
  players: number;
  assigned: number;
  scene: boolean;
}): SetupStep[] {
  return [
    {
      key: "univers",
      label: "Choisir l’univers de ton jeu",
      to: "/mj/univers",
      done: t.preset !== "neutre" || t.tableNamed,
    },
    {
      key: "joueurs",
      label: "Inviter tes joueurs",
      to: "/mj/joueurs",
      done: t.players > 0,
    },
    {
      key: "personnages",
      label: "Créer les personnages",
      to: "/mj/personnages",
      done: t.sheets > 0,
    },
    {
      key: "attribuer",
      label: "Donner chaque personnage à son joueur",
      to: "/mj/personnages",
      done: t.sheets > 0 && t.assigned >= t.sheets,
    },
    { key: "scene", label: "Afficher une première scène", to: "/mj/scenes", done: t.scene },
  ];
}
