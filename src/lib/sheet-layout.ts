/* ------------------------------------------------------------------ */
/* Disposition de la fiche, choisie par chaque membre pour lui-même    */
/* ------------------------------------------------------------------ */
/*
 * Plateau libre de 12 colonnes sur toute la largeur. Chaque bloc a une colonne de départ `x`,
 * une largeur `w` et une hauteur souhaitée `y` (en pixels) : on peut laisser des espaces.
 * La hauteur d'un bloc suit son contenu ; un bloc qui grandit pousse ceux du dessous
 * au lieu de les recouvrir (resolveLayout).
 */

/** Les blocs de la fiche. `tab` : l'onglet du téléphone où il apparaît. */
export const SHEET_BLOCKS = [
  { key: "ident", tab: "perso", x: 0, w: 4 },
  { key: "vitals", tab: "perso", x: 0, w: 4 },
  { key: "stats", tab: "perso", x: 0, w: 4 },
  { key: "features", tab: "perso", x: 0, w: 4 },
  { key: "notes", tab: "perso", x: 0, w: 4 },
  { key: "skills", tab: "skills", x: 4, w: 4 },
  { key: "weapons", tab: "combat", x: 8, w: 4 },
  { key: "slots", tab: "combat", x: 8, w: 4 },
  { key: "money", tab: "sac", x: 8, w: 4 },
  { key: "inventory", tab: "sac", x: 8, w: 4 },
  { key: "shop", tab: "sac", x: 8, w: 4 },
] as const;
export type SheetBlock = (typeof SHEET_BLOCKS)[number]["key"];
export type SheetTab = (typeof SHEET_BLOCKS)[number]["tab"];

export const GRID_COLUMNS = 12;
/** Écart entre deux blocs, en pixels (le même que celui des panneaux) */
export const GRID_GAP = 14;
/** Pas de placement vertical, en pixels */
export const ROW_SNAP = 10;
const MAX_Y = 20000;

export type PlacedBlock = { key: SheetBlock; x: number; y: number; w: number; hidden: boolean };
/** L'ordre du tableau départage deux blocs souhaités à la même hauteur. */
export type SheetLayout = { blocks: PlacedBlock[] };

export const DEFAULT_SHEET_LAYOUT: SheetLayout = {
  blocks: SHEET_BLOCKS.map((b) => ({ key: b.key, x: b.x, y: 0, w: b.w, hidden: false })),
};

export const blockTab = (key: SheetBlock): SheetTab =>
  SHEET_BLOCKS.find((b) => b.key === key)?.tab ?? "perso";

const int = (v: unknown, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.round(v) : fallback;
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/** Garde un bloc dans le plateau : largeur 2 à 12, jamais au-delà du bord droit. */
function fit(b: PlacedBlock): PlacedBlock {
  const w = clamp(b.w, 2, GRID_COLUMNS);
  return {
    ...b,
    w,
    x: clamp(b.x, 0, GRID_COLUMNS - w),
    y: clamp(Math.round(b.y / ROW_SNAP) * ROW_SNAP, 0, MAX_Y),
  };
}

/** Lit la disposition enregistrée ; un bloc ajouté plus tard arrive visible, à sa place d'origine. */
export function readSheetLayout(raw: unknown): SheetLayout {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const saved = (Array.isArray(o["blocks"]) ? o["blocks"] : []).flatMap((b) => {
    const v = (b ?? {}) as Record<string, unknown>;
    const def = SHEET_BLOCKS.find((d) => d.key === v["key"]);
    // Une disposition sans `x` vient de l'ancien format en colonnes : on repart de l'origine
    if (!def || typeof v["x"] !== "number") return [];
    return [
      fit({
        key: def.key,
        x: int(v["x"], def.x),
        y: int(v["y"], 0),
        w: int(v["w"], def.w),
        hidden: v["hidden"] === true,
      }),
    ];
  });
  const unique = saved.filter((b, i) => saved.findIndex((x) => x.key === b.key) === i);
  const missing = DEFAULT_SHEET_LAYOUT.blocks.filter((d) => !unique.some((b) => b.key === d.key));
  return { blocks: [...unique, ...missing] };
}

const sideBySide = (a: { x: number; w: number }, b: { x: number; w: number }) =>
  a.x < b.x + b.w && b.x < a.x + a.w;

/**
 * Position réelle de chaque bloc, en pixels depuis le haut du plateau.
 * Les blocs sont posés du plus haut souhaité au plus bas ; un bloc qui chevaucherait
 * un bloc déjà posé descend juste en dessous. `heights` : hauteur mesurée de chaque bloc.
 */
export function resolveLayout(
  blocks: PlacedBlock[],
  heights: Partial<Record<SheetBlock, number>>,
): { tops: Partial<Record<SheetBlock, number>>; height: number } {
  const order = blocks
    .map((b, i) => ({ b, i }))
    .sort((p, q) => p.b.y - q.b.y || p.i - q.i)
    .map((p) => p.b);
  const placed: { x: number; w: number; top: number; h: number }[] = [];
  const tops: Partial<Record<SheetBlock, number>> = {};
  let height = 0;
  for (const b of order) {
    const h = heights[b.key] ?? 0;
    let top = b.y;
    for (let moved = true; moved;) {
      moved = false;
      for (const p of placed) {
        if (sideBySide(b, p) && p.top < top + h + GRID_GAP && top < p.top + p.h + GRID_GAP) {
          top = p.top + p.h + GRID_GAP;
          moved = true;
        }
      }
    }
    placed.push({ x: b.x, w: b.w, top, h });
    tops[b.key] = top;
    height = Math.max(height, top + h);
  }
  return { tops, height };
}

/** Fige chaque bloc à sa position réelle : un déplacement ne fait plus bouger les autres. */
export function freezeLayout(
  layout: SheetLayout,
  tops: Partial<Record<SheetBlock, number>>,
): SheetLayout {
  return {
    blocks: layout.blocks.map((b) => ({ ...b, y: tops[b.key] ?? b.y })),
  };
}

/**
 * Pose un bloc à une colonne et une hauteur (calées sur la grille).
 * Il passe en tête de liste : à hauteur égale, c'est lui qui garde la place.
 */
export function placeBlock(layout: SheetLayout, key: string, x: number, y: number): SheetLayout {
  const moved = layout.blocks.find((b) => b.key === key);
  if (!moved) return layout;
  return { blocks: [fit({ ...moved, x, y }), ...layout.blocks.filter((b) => b !== moved)] };
}

/** Change la largeur d'un bloc, en colonnes ; il reste dans le plateau. */
export function resizeBlock(layout: SheetLayout, key: string, w: number): SheetLayout {
  return {
    blocks: layout.blocks.map((b) =>
      b.key === key
        ? fit({ ...b, w, x: Math.min(b.x, GRID_COLUMNS - clamp(w, 2, GRID_COLUMNS)) })
        : b,
    ),
  };
}

/** Retire les espaces vides : chaque bloc remonte autant qu'il peut, sans changer d'ordre. */
export function compactLayout(
  layout: SheetLayout,
  tops: Partial<Record<SheetBlock, number>>,
): SheetLayout {
  const order = [...layout.blocks].sort(
    (a, b) => (tops[a.key] ?? a.y) - (tops[b.key] ?? b.y) || a.x - b.x,
  );
  return { blocks: order.map((b) => ({ ...b, y: 0 })) };
}

/** Ordre de lecture sur téléphone : de haut en bas, puis de gauche à droite. */
export function readingOrder(layout: SheetLayout): PlacedBlock[] {
  return layout.blocks
    .map((b, i) => ({ b, i }))
    .sort((p, q) => p.b.y - q.b.y || p.b.x - q.b.x || p.i - q.i)
    .map((p) => p.b);
}

export const toggleBlock = (
  layout: SheetLayout,
  key: SheetBlock,
  hidden: boolean,
): SheetLayout => ({
  blocks: layout.blocks.map((b) => (b.key === key ? { ...b, hidden } : b)),
});
