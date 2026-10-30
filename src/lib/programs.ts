/**
 * EMPLACEMENTS — éléments (programmes, sorts, pouvoirs…) rangés dans une capacité limitée.
 *
 *   • Le MJ fixe le nombre de slots du deck, et pour chaque programme : slots occupés, dé, effet.
 *   • Le joueur crée / renomme / retire ses programmes et choisit lesquels sont ACTIFS.
 *   • Les programmes actifs ne peuvent jamais dépasser les slots du deck.
 *   • Un programme créé par le joueur attend que le MJ fixe son coût (slots = null) avant d'être activable.
 *
 * Ces règles sont aussi vérifiées par la base (cyberdeck.sql) : la base reste l'arbitre final.
 */
export type Program = {
  id: string;
  name: string;
  /** Slots occupés, fixés par le MJ. null = en attente du MJ */
  slots: number | null;
  /** Dé associé, fixé par le MJ (« 1d6 », « 2d6+1 »…). Vide = pas de dé */
  dice: string;
  /** Effet / description, fixé par le MJ */
  effect: string;
  active: boolean;
};

export const PROGRAMS_MAX = 30;
export const PROGRAM_NAME_MAX = 60;
export const PROGRAM_EFFECT_MAX = 500;
export const DECK_SLOTS_MAX = 20;
export const PROGRAM_SLOTS_MAX = 10;

const clampInt = (v: unknown, min: number, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};

/** Lit la colonne jsonb en tolérant les données incomplètes */
export function readPrograms(raw: unknown): Program[] {
  if (!Array.isArray(raw)) return [];
  const out: Program[] = [];
  for (const p of raw) {
    if (!p || typeof p !== "object") continue;
    const o = p as Record<string, unknown>;
    if (typeof o["id"] !== "string" || !o["id"]) continue;
    out.push({
      id: o["id"],
      name: typeof o["name"] === "string" ? o["name"] : "",
      slots:
        o["slots"] === null || o["slots"] === undefined
          ? null
          : clampInt(o["slots"], 1, PROGRAM_SLOTS_MAX),
      dice: typeof o["dice"] === "string" ? o["dice"] : "",
      effect: typeof o["effect"] === "string" ? o["effect"] : "",
      active: o["active"] === true,
    });
  }
  return out;
}

export const readDeckSlots = (raw: unknown) => clampInt(raw ?? 0, 0, DECK_SLOTS_MAX);

export const usedSlots = (ps: Program[]) =>
  ps.reduce((s, p) => s + (p.active && p.slots ? p.slots : 0), 0);

export type ActivationCheck =
  { ok: true } | { ok: false; reason: "pending" } | { ok: false; reason: "room"; missing: number };

/** Le programme peut-il être activé avec les slots restants ? */
export function canActivate(ps: Program[], capacity: number, id: string): ActivationCheck {
  const p = ps.find((x) => x.id === id);
  if (!p || p.slots === null) return { ok: false, reason: "pending" };
  if (p.active) return { ok: true };
  const missing = usedSlots(ps) + p.slots - capacity;
  return missing > 0 ? { ok: false, reason: "room", missing } : { ok: true };
}

/** Active / désactive. Renvoie null si l'activation dépasserait les slots */
export function toggleProgram(ps: Program[], capacity: number, id: string): Program[] | null {
  const p = ps.find((x) => x.id === id);
  if (!p) return null;
  if (!p.active && !canActivate(ps, capacity, id).ok) return null;
  return ps.map((x) => (x.id === id ? { ...x, active: !x.active } : x));
}

/**
 * Après un changement du MJ (moins de slots dans le deck, programme plus gros) :
 * désactive des programmes jusqu'à ce que tout rentre. On désactive d'abord `prefer`
 * (le programme qui vient de grossir), puis en partant du dernier de la liste.
 */
export function fitToCapacity(ps: Program[], capacity: number, prefer?: string): Program[] {
  let out = ps;
  const order = [...ps].reverse().map((p) => p.id);
  if (prefer) order.unshift(prefer);
  for (const id of order) {
    if (usedSlots(out) <= capacity) break;
    out = out.map((x) => (x.id === id && x.active ? { ...x, active: false } : x));
  }
  return out;
}

/** « 2d6+1 », « 1D10 », « d6 », « 3d6 - 2 » → { count, sides, mod }. null si illisible */
export function parseProgramDice(s: string): { count: number; sides: number; mod: number } | null {
  const m = /^\s*(\d*)\s*[dD]\s*(\d+)\s*(?:([+\-−])\s*(\d+))?\s*$/.exec(s);
  if (!m) return null;
  const count = m[1] ? Number(m[1]) : 1;
  const sides = Number(m[2]);
  const mod = m[4] ? (m[3] === "+" ? 1 : -1) * Number(m[4]) : 0;
  if (count < 1 || count > 10 || sides < 2 || sides > 100 || Math.abs(mod) > 100) return null;
  return { count, sides, mod };
}

export function newProgram(name: string, byGm: boolean): Program {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    name: name.trim().slice(0, PROGRAM_NAME_MAX),
    slots: byGm ? 1 : null,
    dice: "",
    effect: "",
    active: false,
  };
}
