/**
 * CATALOGUE — ce que le MJ prépare à l'avance : armes, consommables, pouvoirs, équipement.
 * Rien de propre à un jeu ici : les cibles d'effet viennent des règles de l'univers.
 */
import { parseDamage, readStats, statLabel, writeStat, type Sheet } from "./sheet";
import { gaugeMax, hpMaxFor, type Universe } from "./universe";

export const ITEM_KINDS = [
  { key: "weapon", label: "Arme" },
  { key: "consumable", label: "Consommable" },
  { key: "power", label: "Pouvoir" },
  { key: "gear", label: "Équipement" },
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number]["key"];

/** Cible : « hp », « money », « stat:CLÉ » ou « gauge:CLÉ ». */
export type ItemEffect = { target: string; amount: number; useDie: boolean };
export type ItemData = {
  dmg: string;
  capacity: number;
  rof: number;
  skill: string;
  slots: number;
  /** Dé lancé à l'utilisation, ex. 2d6+1 */
  die: string;
  effects: ItemEffect[];
};
export type CatalogItem = {
  id: string;
  kind: string;
  category: string;
  name: string;
  description: string;
  price: number;
  in_shop: boolean;
  data: ItemData;
};

export const EMPTY_DATA: ItemData = {
  dmg: "",
  capacity: 0,
  rof: 1,
  skill: "",
  slots: 1,
  die: "",
  effects: [],
};

const whole = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export function readItemData(raw: unknown): ItemData {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const effects = Array.isArray(o["effects"]) ? o["effects"] : [];
  return {
    dmg: text(o["dmg"], 30),
    capacity: whole(o["capacity"], 0, 999, 0),
    rof: whole(o["rof"], 1, 20, 1),
    skill: text(o["skill"], 60),
    slots: whole(o["slots"], 1, 10, 1),
    die: text(o["die"], 12),
    effects: effects.slice(0, 8).flatMap((e) => {
      const x = (e ?? {}) as Record<string, unknown>;
      if (typeof x["target"] !== "string" || !x["target"]) return [];
      return [
        {
          target: x["target"],
          amount: whole(x["amount"], -100000, 100000, 0),
          useDie: x["useDie"] === true,
        },
      ];
    }),
  };
}

/** Tout ce sur quoi un effet peut agir, d'après l'univers actif. */
export function effectTargets(u: Universe): { key: string; label: string }[] {
  return [
    { key: "hp", label: u.words.hp },
    ...(u.modules.money ? [{ key: "money", label: u.words.money }] : []),
    ...u.rules.gauges.map((g) => ({ key: `gauge:${g.key}`, label: g.label })),
    ...u.rules.stats.map((s) => ({ key: `stat:${s.key}`, label: s.label })),
  ];
}

export const targetLabel = (target: string, u: Universe) =>
  effectTargets(u).find((t) => t.key === target)?.label ?? target;

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** Résumé lisible des effets, pour la boutique et l'inventaire. */
export function describeEffects(data: ItemData, u: Universe) {
  return data.effects
    .map((e) => {
      const value = e.useDie ? `${e.amount < 0 ? "−" : "+"}${data.die || "dé"}` : signed(e.amount);
      return `${targetLabel(e.target, u)} ${value}`;
    })
    .join(" · ");
}

export type EffectState = { hp: number; money: number; sheet: Sheet };

/**
 * Applique les effets d'un objet. Les caractéristiques passent d'abord : un nouveau maximum
 * de PV ou de jauge vaut alors tout de suite, et les PV ne dépassent jamais le maximum.
 * `roll` : résultat du dé, utilisé par les effets marqués useDie (amount donne alors le signe).
 */
export function applyEffects(
  state: EffectState,
  effects: ItemEffect[],
  roll: number | null,
  u: Universe,
): EffectState & { lines: string[] } {
  const value = (e: ItemEffect) => (e.useDie ? (roll ?? 0) * (e.amount < 0 ? -1 : 1) : e.amount);
  let sheet: Sheet = state.sheet;
  const lines: string[] = [];
  const ordered = [...effects].sort(
    (a, b) => Number(b.target.startsWith("stat:")) - Number(a.target.startsWith("stat:")),
  );
  let hp = state.hp;
  let money = state.money;
  for (const e of ordered) {
    const v = value(e);
    if (e.target.startsWith("stat:")) {
      const key = e.target.slice(5);
      if (!u.rules.stats.some((s) => s.key === key)) continue;
      const current = readStats(sheet, u)[key] ?? 0;
      sheet = { ...sheet, stats: writeStat(sheet, key, current + v, u) };
      lines.push(`${statLabel(key, u)} ${signed(v)}`);
    } else if (e.target.startsWith("gauge:")) {
      const key = e.target.slice(6);
      const gauge = u.rules.gauges.find((g) => g.key === key);
      if (!gauge) continue;
      const max = gaugeMax(u, gauge, readStats(sheet, u), sheet);
      const next = Math.max(0, Math.min(max, (Number(sheet[key]) || 0) + v));
      sheet = { ...sheet, [key]: next };
      lines.push(`${gauge.label} ${signed(v)}`);
    } else if (e.target === "money") {
      money = Math.max(0, money + v);
      lines.push(`${u.words.money} ${signed(v)}`);
    } else if (e.target === "hp") {
      hp += v;
      lines.push(`${u.words.hp} ${signed(v)}`);
    }
  }
  const max = hpMaxFor(u, readStats(sheet, u), sheet);
  return { hp: Math.max(0, Math.min(max, hp)), money, sheet, lines };
}

export type RollPlan = { count: number; sides: number; mod: number };

/** Dé d'un objet ; null s'il n'y en a pas ou s'il est mal écrit. */
export function parseItemDie(die: string): RollPlan | null {
  const plan = parseDamage(die.trim());
  return plan && plan.count >= 1 && plan.count <= 10 && plan.sides >= 2 ? plan : null;
}

export const itemErrors = (name: string, data: ItemData): string | null => {
  if (!name.trim()) return "Donne un nom.";
  if (data.die.trim() && !parseItemDie(data.die)) return "Dé invalide : écris par exemple 2d6+1.";
  if (data.effects.some((e) => e.useDie) && !parseItemDie(data.die))
    return "Un effet utilise le dé : indique le dé de l’objet.";
  return null;
};
