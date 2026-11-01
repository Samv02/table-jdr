import type { AmmoEntry, InventoryItem } from "@/lib/character-import";
import { readDeckSlots, readPrograms, type Program } from "@/lib/programs";
import { hpMax, readStats, type Sheet } from "@/lib/sheet";
import { gaugeMax, type Universe } from "@/lib/universe";

/** Une fiche à afficher dans l'aperçu : aucune de ces valeurs ne repart vers la base. */
export type PreviewCharacter = {
  id: string;
  name: string;
  handle: string | null;
  sheet: Sheet;
  hp_current: number;
  eddies: number;
  ammo: Record<string, AmmoEntry>;
  inventory: InventoryItem[];
  programs: Program[];
  program_slots: number;
};

/** Valeur plausible d'une carac dans cet univers (même échelle que l'exemple de la page Jets). */
export function sampleStat(u: Universe) {
  if (u.rules.rollMode === "under") return 40;
  return u.rules.skillDice.sides >= 20 ? 14 : 5;
}

/** Personnage fictif construit uniquement à partir de l'univers : rien de propre à un jeu ici. */
export function sampleCharacter(u: Universe): PreviewCharacter {
  const value = sampleStat(u);
  const stats = Object.fromEntries(
    u.rules.stats.map((s) => [s.key, u.template.stats[s.key] ?? value]),
  );
  const listed = u.template.skills.length ? u.template.skills : u.rules.skillLibrary;
  const skills = listed.length
    ? listed.slice(0, 8)
    : u.rules.stats.slice(0, 3).map((s) => ({ name: s.label, stat: s.key, level: 3 }));
  const sheet: Sheet = {
    stats,
    skills: skills.map((s) => ({ ...s, level: s.level || 3 })),
    hpMax: 20,
    cyberware: "Exemple",
    weapons: [
      {
        name: u.words.attack,
        dmg: "1d6",
        ammo: u.modules.ammo ? "10" : "",
        rof: 1,
        skill: skills[0]?.name ?? "",
      },
    ],
  };
  for (const g of u.rules.gauges) {
    sheet[`${g.key}Max`] = 10;
    const read = readStats(sheet, u);
    sheet[g.key] = Math.ceil(gaugeMax(u, g, read, sheet) * 0.7);
  }
  const max = hpMax(readStats(sheet, u), sheet, u);
  return {
    id: "exemple",
    name: u.words.playerDefault,
    handle: null,
    sheet,
    hp_current: Math.ceil(max * 0.6),
    eddies: u.template.money || 100,
    ammo: {},
    inventory: [{ name: "Objet d'exemple", qty: 2 }],
    programs: [],
    program_slots: u.modules.slots ? u.template.slots || 3 : 0,
  };
}

/** Lignes de la base → fiche d'aperçu, en lecture seule. */
export function previewFromRows(
  c: { id: string; name: string; handle: string | null; sheet: unknown },
  s: Record<string, unknown> | undefined,
): PreviewCharacter {
  return {
    id: c.id,
    name: c.name,
    handle: c.handle,
    sheet: (c.sheet as Sheet) ?? {},
    hp_current: Number(s?.["hp_current"]) || 0,
    eddies: Number(s?.["eddies"]) || 0,
    ammo: (s?.["ammo"] as Record<string, AmmoEntry>) ?? {},
    inventory: (s?.["inventory"] as InventoryItem[]) ?? [],
    programs: readPrograms(s?.["programs"]),
    program_slots: readDeckSlots(s?.["program_slots"]),
  };
}

/** 6 caracs → 3 colonnes, 8 → 4, 10 → 5 : jamais de case orpheline */
export function statColumns(n: number) {
  if (n <= 4) return Math.max(1, n);
  for (const c of [5, 4, 3]) if (n % c === 0) return c;
  return n <= 6 ? 3 : n <= 8 ? 4 : 5;
}

/** Les trois meilleures caractéristiques, mises en valeur (quelle que soit l'échelle du jeu) */
export function topStatKeys(stats: Record<string, number>) {
  const values = Object.values(stats).filter((v) => v > 0);
  if (values.length < 4) return new Set<string>();
  const cut = [...values].sort((a, b) => b - a)[2]!;
  return new Set(
    Object.entries(stats)
      .filter(([, v]) => v > 0 && v >= cut)
      .map(([k]) => k),
  );
}
