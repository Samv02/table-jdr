import {
  skillBase,
  statKey,
  weaponSkill,
  type SheetSkill,
  type SheetWeapon,
  type Stats,
} from "./sheet";
import { unarmedDamage, type Universe, type WeaponHint } from "./universe";

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’]/g, "'")
    .trim();
/** Deux attaques d'affilée : armes à cadence ≥ 2 */
export const canDouble = (weapon: SheetWeapon) => weapon.rof >= 2;
/** Tir automatique : seulement si l'univers l'active, et pour les armes automatiques */
export const canAutofire = (weapon: SheetWeapon, u?: Universe) =>
  (u ? u.rules.autofire : true) &&
  /mitraillette|\bsmg\b|fusil d'assaut|automatique/.test(normalize(weapon.name));
export const isUnarmed = (weapon: SheetWeapon) =>
  /^(a )?mains? nues?$|^poings?$|^unarmed$/.test(normalize(weapon.name));

/** Dégâts affichés : mains nues calculées par l'univers s'il a une règle, sinon ceux écrits sur l'arme */
export function weaponDamage(weapon: SheetWeapon, stats: Stats, u: Universe) {
  if (isUnarmed(weapon)) return unarmedDamage(u, stats) ?? weapon.dmg;
  return weapon.dmg;
}

function aliases(name: string): string[] {
  const n = normalize(name);
  if (/autofire|tir automatique/.test(n)) return ["tir automatique", "autofire"];
  if (/bagarre|brawling|mains nues|pugilat/.test(n))
    return ["bagarre", "brawling", "mains nues", "pugilat"];
  if (/pistolet|handguns/.test(n)) return ["pistolets", "handguns"];
  if (/fusil|shoulder arms/.test(n)) return ["fusils", "shoulder arms"];
  if (/melee|cac|càc/.test(n)) return ["melee", "cac", "càc"];
  return [n];
}

/** Base d'attaque d'une arme : compétence apprise si elle existe, sinon caractéristique seule (non apprise) */
export function weaponAttack(
  weapon: SheetWeapon,
  skills: SheetSkill[],
  stats: Stats,
  u: Universe,
  auto = false,
) {
  const unarmed = isUnarmed(weapon);
  const name = auto
    ? "Tir automatique (Autofire)"
    : unarmed
      ? "Bagarre (Brawling)"
      : weaponSkill(weapon);
  const names = aliases(name);
  const learned = skills.find((skill) =>
    names.some((alias) => normalize(skill.name).includes(alias)),
  );
  const fallback = auto || weapon.capacity > 0 ? u.rules.rangedStat : u.rules.meleeStat;
  const stat = auto
    ? u.rules.rangedStat
    : unarmed
      ? u.rules.meleeStat
      : learned
        ? (statKey(learned.stat, u) ?? fallback)
        : fallback;
  const base = skillBase({ name, stat, level: learned?.level ?? 0 }, stats, u);
  return { name: learned?.name ?? name, stat, base, unlearned: !learned };
}

/**
 * Suggestion pour une arme, d'après son nom et les suggestions de l'univers.
 * Le mot le plus long qui se trouve dans le nom l'emporte (« fusil d'assaut » avant « fusil »).
 */
export function guessWeapon(name: string, u: Universe): { hint: WeaponHint; word: string } | null {
  const n = ` ${normalize(name)} `;
  let best: { hint: WeaponHint; word: string } | null = null;
  for (const hint of u.rules.weaponHints)
    for (const raw of hint.words.split(",")) {
      const word = normalize(raw);
      if (!word) continue;
      // Un mot entier : « arc » ne se trouve pas dans « parc »
      const at = n.indexOf(word);
      const whole =
        at > 0 && !/[a-z0-9]/.test(n[at - 1]!) && !/[a-z0-9]/.test(n[at + word.length] ?? " ");
      if (whole && (!best || word.length > best.word.length)) best = { hint, word };
    }
  return best;
}

/** L'arme une fois la suggestion appliquée ; une valeur vide de la suggestion ne change rien. */
export function applyWeaponHint(w: SheetWeapon, hint: WeaponHint): SheetWeapon {
  return {
    ...w,
    ...(hint.skill ? { skill: hint.skill } : {}),
    capacity: hint.capacity,
    ammoRaw: hint.capacity ? String(hint.capacity) : "",
    ...(hint.dmg ? { dmg: hint.dmg } : {}),
    ...(hint.rof ? { rof: hint.rof } : {}),
  };
}

/** La suggestion changerait-elle quelque chose ? */
export const hintChanges = (w: SheetWeapon, hint: WeaponHint) => {
  const next = applyWeaponHint(w, hint);
  return (
    next.skill !== w.skill ||
    next.capacity !== w.capacity ||
    next.dmg !== w.dmg ||
    next.rof !== w.rof
  );
};
