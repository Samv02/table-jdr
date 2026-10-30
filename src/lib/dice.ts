export const DICE_SIDES = [4, 6, 8, 10, 12, 20, 100] as const;
export const MAX_DICE_SIDES = 10_000;

export type RollInput = {
  dice_count: number;
  dice_sides: number;
  modifier: number;
  label: string | null;
  is_secret: boolean;
  character_id: string | null;
  /** Jet « sous la base » (pourcentage) : valeur à ne pas dépasser. null = jet classique */
  target?: number | null;
};

export function validateRoll(i: RollInput): string | null {
  if (!Number.isInteger(i.dice_count) || i.dice_count < 1 || i.dice_count > 10)
    return "Nombre de dés invalide (1 à 10)";
  if (!Number.isInteger(i.dice_sides) || i.dice_sides < 2 || i.dice_sides > MAX_DICE_SIDES)
    return "Nombre de faces invalide (2 à 10 000)";
  if (!Number.isInteger(i.modifier) || Math.abs(i.modifier) > 1000) return "Modificateur invalide";
  if (i.target != null && (!Number.isInteger(i.target) || i.target < -1000 || i.target > 10000))
    return "Cible invalide";
  return null;
}

/** Unbiased die roll using crypto.getRandomValues (rejection sampling). */
export function rollDie(sides: number): number {
  const max = Math.floor(0x100000000 / sides) * sides;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while ((buf[0] ?? 0) >= max);
  return ((buf[0] ?? 0) % sides) + 1;
}

export function formula(count: number, sides: number, mod: number) {
  return `${count}d${sides}${mod ? (mod > 0 ? ` + ${mod}` : ` − ${-mod}`) : ""}`;
}

export type RollCharacter = { owner_id: string | null; handle: string | null; name: string };

/**
 * Règle absolue : personne ne lance un dé au nom de quelqu'un d'autre, même pas le MJ.
 * - character_id fourni → le personnage DOIT appartenir à l'utilisateur.
 * - sans character_id → seul le MJ peut lancer (en tant que "MJ").
 */
export function resolveDisplayName(opts: {
  userId: string;
  isGm: boolean;
  characterId: string | null;
  character: RollCharacter | null;
}): string {
  if (opts.characterId) {
    if (!opts.character || opts.character.owner_id !== opts.userId) {
      throw new Error("Tu ne peux lancer les dés que pour ton propre personnage.");
    }
    return opts.character.handle || opts.character.name;
  }
  if (!opts.isGm) throw new Error("Choisis ton personnage pour lancer les dés.");
  return "MJ";
}
