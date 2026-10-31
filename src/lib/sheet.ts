// Lecture du JSON de personnage (characters.sheet) et calculs de règles.
// Les caractéristiques, formules et seuils viennent de l'univers de la table (lib/universe).
// Les lecteurs acceptent plusieurs variantes de clés (fr/en, accents) et renvoient des structures normalisées.

import type { AmmoEntry } from "./character-import";
import { varKey } from "./formula";
import { hpMaxFor, skillBaseFor, type Stats, type Universe } from "./universe";

export type Sheet = Record<string, unknown>;
export type { Stats };

/** Nom libre pour une nouvelle compétence (les compétences sont rangées par nom : pas de doublon) */
export function newSkillName(existing: { name: string }[], base = "Nouvelle compétence") {
  let name = base,
    n = 1;
  while (existing.some((s) => s.name === name)) name = `${base} ${++n}`;
  return name;
}

/** Clé de caractéristique de l'univers correspondant à un nom lu dans une fiche (clé, libellé ou alias) */
export function statKey(k: string, u: Universe): string | null {
  const v = varKey(k);
  if (!v) return null;
  for (const s of u.rules.stats) {
    if (s.key === v || varKey(s.label) === v || s.aliases?.some((a) => varKey(a) === v))
      return s.key;
  }
  return null;
}
export const statLabel = (key: string, u: Universe) =>
  u.rules.stats.find((s) => s.key === key)?.label ?? key;

export function readStats(sheet: Sheet, u: Universe): Stats {
  const out: Stats = Object.fromEntries(u.rules.stats.map((s) => [s.key, 0]));
  const src = sheet["stats"];
  const put = (k: unknown, v: unknown) => {
    const key = statKey(String(k ?? ""), u);
    if (key) out[key] = Number(v) || 0;
  };
  if (Array.isArray(src)) {
    for (const item of src) {
      const o = (item ?? {}) as Record<string, unknown>;
      put(o["name"] ?? o["nom"] ?? o["key"], o["value"] ?? o["valeur"] ?? o["val"]);
    }
  } else if (src && typeof src === "object") {
    for (const [k, v] of Object.entries(src as Record<string, unknown>)) put(k, v);
  }
  return out;
}

/** Écrit une caractéristique en conservant la clé d'origine du JSON si elle existe déjà */
export function writeStat(
  sheet: Sheet,
  key: string,
  value: number,
  u: Universe,
): Record<string, unknown> {
  const src = sheet["stats"];
  const base =
    src && typeof src === "object" && !Array.isArray(src)
      ? { ...(src as Record<string, unknown>) }
      : {};
  const existing = Object.keys(base).find((k) => statKey(k, u) === key) ?? key;
  base[existing] = value;
  return base;
}

export type SheetSkill = { name: string; stat: string; level: number; title?: string };

export function readSkills(sheet: Sheet): SheetSkill[] {
  const src = sheet["skills"];
  // Forme objet : { "Pistolets": { stat: "REF", val: 6 } }
  if (src && typeof src === "object" && !Array.isArray(src)) {
    return Object.entries(src as Record<string, unknown>).map(([name, v]) => {
      const o = (v ?? {}) as Record<string, unknown>;
      return {
        name,
        ...(typeof o["title"] === "string" && o["title"].trim()
          ? { title: o["title"].trim() }
          : {}),
        stat: String(o["stat"] ?? "").trim(),
        level: Number(o["val"] ?? o["level"] ?? o["niveau"]) || 0,
      };
    });
  }
  if (!Array.isArray(src)) return [];
  return src
    .map((s) => {
      const o = (s ?? {}) as Record<string, unknown>;
      return {
        name: String(o["name"] ?? o["nom"] ?? "").trim(),
        ...(typeof o["title"] === "string" && o["title"].trim()
          ? { title: o["title"].trim() }
          : {}),
        stat: String(
          o["stat"] ?? o["carac"] ?? o["caracteristique"] ?? o["caractéristique"] ?? "",
        ).trim(),
        level: Number(o["level"] ?? o["niveau"] ?? o["lvl"]) || 0,
      };
    })
    .filter((s) => s.name);
}

/** Réécrit les compétences en conservant la forme d'origine (objet ou tableau). */
export function writeSkills(sheet: Sheet, skills: SheetSkill[]): unknown {
  const src = sheet["skills"];
  if (src && typeof src === "object" && !Array.isArray(src)) {
    const out: Record<string, unknown> = {};
    for (const s of skills) {
      const orig = (src as Record<string, unknown>)[s.name];
      const o = (
        orig && typeof orig === "object" ? { ...(orig as Record<string, unknown>) } : {}
      ) as Record<string, unknown>;
      o["stat"] = s.stat;
      if (s.title?.trim()) o["title"] = s.title.trim();
      else delete o["title"];
      if ("level" in o && !("val" in o)) o["level"] = s.level;
      else o["val"] = s.level;
      out[s.name] = o;
    }
    return out;
  }
  return skills.map((s) => ({
    name: s.name,
    stat: s.stat,
    level: s.level,
    ...(s.title?.trim() ? { title: s.title.trim() } : {}),
  }));
}

const skillId = (name: string) => name.trim().normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Compétences de la bibliothèque absentes de la fiche, sans tenir compte des accents ni de la casse. */
export function missingSkills<T extends { name: string }>(
  library: T[],
  skills: { name: string }[],
) {
  const owned = new Set(skills.map((s) => skillId(s.name)));
  return library.filter((s) => !owned.has(skillId(s.name)));
}

/** Ajoute des compétences à la fiche sans jamais créer de doublon. */
export function addSkills(
  skills: SheetSkill[],
  items: { name: string; stat: string; level: number }[],
): SheetSkill[] {
  return [...skills, ...missingSkills(items, skills)];
}

/** Base d'une compétence, selon la formule de l'univers (par défaut : caractéristique + niveau). */
export function skillBase(skill: SheetSkill, stats: Stats, u: Universe): number {
  const key = statKey(skill.stat, u);
  return skillBaseFor(u, key ? (stats[key] ?? 0) : 0, skill.level, stats);
}

export type SheetWeapon = {
  name: string;
  dmg: string;
  ammoRaw: string;
  capacity: number;
  rof: number;
  skill: string;
  note: string;
};

export function readWeapons(sheet: Sheet): SheetWeapon[] {
  const src = sheet["weapons"];
  if (!Array.isArray(src)) return [];
  return src
    .map((w) => {
      const o = (w ?? {}) as Record<string, unknown>;
      const ammoRaw = String(o["ammo"] ?? o["munitions"] ?? "").trim();
      return {
        name: String(o["name"] ?? o["nom"] ?? "").trim(),
        dmg: String(o["dmg"] ?? o["damage"] ?? o["degats"] ?? o["dégâts"] ?? "").trim(),
        ammoRaw,
        capacity: /^\d+$/.test(ammoRaw) ? parseInt(ammoRaw, 10) : 0,
        rof: Number(o["rof"] ?? o["cadence"]) || 1,
        skill: String(o["skill"] ?? o["competence"] ?? o["compétence"] ?? "").trim(),
        note: String(o["note"] ?? "").trim(),
      };
    })
    .filter((w) => w.name);
}

/** Compétence d'une arme : explicite, sinon déduite du nom / des munitions. */
export function weaponSkill(w: SheetWeapon): string {
  if (w.skill) return w.skill;
  if (w.capacity <= 0) return "Mêlée / CàC";
  const n = w.name.toLowerCase();
  if (/pistolet|mitraillette/.test(n)) return "Pistolets";
  if (/fusil/.test(n)) return "Fusils";
  return "Armes à distance";
}

/** Parse une formule de dégâts type "2d6+3" / "5d6". */
export function parseDamage(dmg: string): { count: number; sides: number; mod: number } | null {
  const m = dmg.match(/(\d+)\s*d\s*(\d+)\s*([+-]\s*\d+)?/i);
  if (!m) return null;
  return {
    count: parseInt(m[1]!, 10),
    sides: parseInt(m[2]!, 10),
    mod: m[3] ? parseInt(m[3].replace(/\s/g, ""), 10) : 0,
  };
}

export function hpMax(stats: Stats, sheet: Sheet, u: Universe): number {
  return hpMaxFor(u, stats, sheet);
}

export type HpStatus = "ok" | "blesse" | "mourant";

/** État de santé. `wounded` = seuil « gravement blessé » (null : l'univers n'en a pas). */
export function hpStatus(hp: number, wounded: number | null): HpStatus {
  if (hp <= 0) return "mourant";
  if (wounded !== null && hp <= wounded) return "blesse";
  return "ok";
}

/** Statut des munitions d'un chargeur. */
export function ammoStatus(mag: number, capacity: number): "OK" | "BAS" | "VIDE" {
  if (mag <= 0) return "VIDE";
  if (mag <= Math.ceil(capacity / 4)) return "BAS";
  return "OK";
}

/** Total de balles disponibles : chargeur + chargeurs pleins + vrac. */
export function ammoTotal(a: AmmoEntry, capacity: number): number {
  return a.mag + a.spare * capacity + a.loose;
}

/**
 * Recharger : utilise un chargeur plein et récupère les balles restantes en vrac,
 * sinon complète le chargeur avec les balles en vrac disponibles.
 */
export function reload(a: AmmoEntry, capacity: number): AmmoEntry {
  if (a.mag >= capacity) return a;
  if (a.spare > 0) return { ...a, mag: capacity, spare: a.spare - 1, loose: a.loose + a.mag };
  const need = capacity - a.mag;
  if (a.loose > 0) {
    const take = Math.min(need, a.loose);
    return { ...a, mag: a.mag + take, loose: a.loose - take };
  }
  return a;
}

/** Assemble one spare magazine from loose rounds without changing the loaded one. */
export function packMagazine(a: AmmoEntry, capacity: number): AmmoEntry {
  if (!Number.isSafeInteger(capacity) || capacity <= 0 || a.loose < capacity) return a;
  return { ...a, spare: a.spare + 1, loose: a.loose - capacity };
}

/** Tir : consomme n balles du chargeur (jamais sous 0). */
export function shoot(a: AmmoEntry, n: number): AmmoEntry {
  return { ...a, mag: Math.max(0, a.mag - n) };
}

/**
 * Garantit une entrée de munitions par arme à balles, clé = position de l'arme
 * dans sheet.weapons ("0" = première arme). Crée { mag: capacité, spare: 2, loose: 0 }.
 */
export function seedAmmo(
  weapons: SheetWeapon[],
  ammo: Record<string, AmmoEntry>,
): { ammo: Record<string, AmmoEntry>; changed: boolean } {
  const out = { ...ammo };
  let changed = false;
  weapons.forEach((w, i) => {
    if (w.capacity > 0 && !out[String(i)]) {
      out[String(i)] = { mag: w.capacity, spare: 2, loose: 0 };
      changed = true;
    }
  });
  return { ammo: out, changed };
}

/** Note d'export : état des munitions rangé dans weapons[].note. */
export function ammoNote(a: AmmoEntry, capacity: number): string {
  return `Chargeur ${a.mag}/${capacity}, ${a.spare} recharges, ${a.loose} en vrac`;
}

export function str(sheet: Sheet, key: string): string {
  const v = sheet[key];
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

export function num(sheet: Sheet, key: string): number {
  return Number(sheet[key]) || 0;
}
