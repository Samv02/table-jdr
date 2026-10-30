import type { AmmoEntry, InventoryItem } from "./character-import";
import { hpMax, hpStatus, readStats, readWeapons, type Sheet } from "./sheet";
import { woundedFor, type Universe } from "./universe";
import type { PartyMember } from "./table-context";

export type DashboardState = {
  hp_current: number;
  eddies: number;
  ammo: Record<string, AmmoEntry>;
  inventory: InventoryItem[];
};
export type DashboardRow = {
  id: string;
  name: string;
  handle: string | null;
  sheet: Sheet;
  players_can_edit: boolean;
  character_state: DashboardState | null;
};
export const loginDestination = (isGm: boolean) =>
  isGm ? ("/mj/tableau" as const) : ("/fiche" as const);
export function hudParty(party: PartyMember[]): PartyMember[] {
  const gm = party.find((p) => p.character_id === "mj");
  return [
    ...party.filter((p) => p.character_id !== "mj"),
    gm ?? { character_id: "mj", handle: "MJ", avatar_url: null, color: "cyan" },
  ];
}
export function dashboardAlerts(row: DashboardRow, u: Universe) {
  const state = row.character_state;
  const stats = readStats(row.sheet, u);
  const max = hpMax(stats, row.sheet, u);
  const health = state
    ? hpStatus(state.hp_current, woundedFor(u, max, stats, row.sheet)) !== "ok"
    : false;
  const ammo =
    u.modules.ammo && state
      ? readWeapons(row.sheet).some((w, i) => {
          const a = state.ammo[String(i)];
          return w.capacity > 0 && !!a && (a.mag <= w.capacity / 3 || a.spare <= 0);
        })
      : false;
  return { health, ammo };
}

/* ------------------------------------------------------------------ */
/* Disposition du tableau de bord, choisie par le MJ                   */
/* ------------------------------------------------------------------ */
export const DASHBOARD_SECTIONS = ["Vitaux", "Stats", "Compétences", "Combat", "Sac"] as const;
export type DashboardSection = (typeof DASHBOARD_SECTIONS)[number];
export const DASHBOARD_SORTS = [
  { key: "manual", label: "Mon ordre" },
  { key: "name", label: "Nom" },
  { key: "hp", label: "Les plus blessés d’abord" },
  { key: "ammo", label: "Munitions les plus basses" },
  { key: "money", label: "Les plus riches d’abord" },
] as const;
export type DashboardSort = (typeof DASHBOARD_SORTS)[number]["key"];

export type DashboardPrefs = {
  order: string[];
  sort: DashboardSort;
  sections: { key: DashboardSection; visible: boolean }[];
  hiddenStats: string[];
  hiddenFields: string[];
  hiddenCharacters: string[];
  onlineOnly: boolean;
  hurtOnly: boolean;
};

export const DEFAULT_PREFS: DashboardPrefs = {
  order: [],
  sort: "manual",
  sections: DASHBOARD_SECTIONS.map((key) => ({ key, visible: true })),
  hiddenStats: [],
  hiddenFields: [],
  hiddenCharacters: [],
  onlineOnly: false,
  hurtOnly: false,
};

const strings = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 200) : [];

/** Lit la disposition enregistrée ; une section ajoutée plus tard arrive visible, à la fin. */
export function readPrefs(raw: unknown): DashboardPrefs {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const saved = (Array.isArray(o["sections"]) ? o["sections"] : []).flatMap((s) => {
    const x = (s ?? {}) as Record<string, unknown>;
    const key = DASHBOARD_SECTIONS.find((k) => k === x["key"]);
    return key ? [{ key, visible: x["visible"] !== false }] : [];
  });
  const missing = DASHBOARD_SECTIONS.filter((k) => !saved.some((s) => s.key === k));
  const sort = DASHBOARD_SORTS.find((s) => s.key === o["sort"])?.key ?? "manual";
  return {
    order: strings(o["order"]),
    sort,
    sections: [...saved, ...missing.map((key) => ({ key, visible: true }))],
    hiddenStats: strings(o["hiddenStats"]),
    hiddenFields: strings(o["hiddenFields"]),
    hiddenCharacters: strings(o["hiddenCharacters"]),
    onlineOnly: o["onlineOnly"] === true,
    hurtOnly: o["hurtOnly"] === true,
  };
}

export const toggleIn = (list: string[], value: string) =>
  list.includes(value) ? list.filter((x) => x !== value) : [...list, value];

/** Les fiches dans l'ordre du MJ ; une nouvelle fiche se place à la fin. */
export function manualOrder<T extends { id: string }>(rows: T[], order: string[]) {
  const rank = (id: string) => {
    const i = order.indexOf(id);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => rank(a.row.id) - rank(b.row.id) || a.index - b.index)
    .map((x) => x.row);
}

export function moveCharacter(order: string[], ids: string[], id: string, delta: number) {
  const list = manualOrder(
    ids.map((x) => ({ id: x })),
    order,
  ).map((x) => x.id);
  const from = list.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= list.length) return list;
  [list[from], list[to]] = [list[to] as string, list[from] as string];
  return list;
}

export function moveSection(sections: DashboardPrefs["sections"], key: string, delta: number) {
  const list = [...sections];
  const from = list.findIndex((s) => s.key === key);
  const to = from + delta;
  const a = list[from];
  const b = list[to];
  if (!a || !b) return list;
  list[from] = b;
  list[to] = a;
  return list;
}

function hpRatio(r: DashboardRow, u: Universe) {
  const max = hpMax(readStats(r.sheet, u), r.sheet, u);
  return max > 0 ? (r.character_state?.hp_current ?? 0) / max : 1;
}
function ammoRatio(r: DashboardRow) {
  const ratios = readWeapons(r.sheet)
    .map((w, i) => ({ w, i }))
    .filter((x) => x.w.capacity > 0)
    .map(({ w, i }) => (r.character_state?.ammo[String(i)]?.mag ?? w.capacity) / w.capacity);
  return ratios.length ? Math.min(...ratios) : Number.POSITIVE_INFINITY;
}

/** Applique filtres et tri du MJ à la liste des fiches. */
export function arrangeRows(
  rows: DashboardRow[],
  prefs: DashboardPrefs,
  ctx: { isOnline: (id: string) => boolean; u: Universe },
) {
  const kept = manualOrder(rows, prefs.order).filter(
    (r) =>
      !prefs.hiddenCharacters.includes(r.id) &&
      (!prefs.onlineOnly || ctx.isOnline(r.id)) &&
      (!prefs.hurtOnly || hpRatio(r, ctx.u) < 1),
  );
  const by = (value: (r: DashboardRow) => number) => [...kept].sort((a, b) => value(a) - value(b));
  switch (prefs.sort) {
    case "name":
      return [...kept].sort((a, b) => (a.handle || a.name).localeCompare(b.handle || b.name, "fr"));
    case "hp":
      return by((r) => hpRatio(r, ctx.u));
    case "ammo":
      return by(ammoRatio);
    case "money":
      return by((r) => -(r.character_state?.eddies ?? 0));
    default:
      return kept;
  }
}
