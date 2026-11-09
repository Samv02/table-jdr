/**
 * Modèles de carte : un point de départ tout prêt, à retoucher ensuite.
 * Chaque modèle donne des formes, des murs, des portes et des textes ordinaires.
 * Rien n'est propre à un jeu : ce sont des lieux génériques.
 */
import type { MapEdge, Point } from "@/lib/map";
import { DEFAULT_DUNGEON, generateDungeon, random } from "@/lib/map-dungeon";
import type { MapObject } from "@/lib/map-objects";
import type { MapShape } from "@/lib/map-shapes";
import type { StyleId } from "@/lib/map-style";

export type TemplateId = "empty" | "room" | "house" | "cave" | "building" | "dungeon";
export type TemplateSize = "s" | "m" | "l";

export type MapDraft = {
  width: number;
  height: number;
  shapes: MapShape[];
  edges: MapEdge[];
  objects: MapObject[];
};

export const TEMPLATE_SIZES: { id: TemplateSize; label: string; w: number; h: number }[] = [
  { id: "s", label: "Petite", w: 20, h: 14 },
  { id: "m", label: "Moyenne", w: 30, h: 20 },
  { id: "l", label: "Grande", w: 40, h: 28 },
];

export const MAP_TEMPLATES: {
  id: TemplateId;
  label: string;
  hint: string;
  /** Apparence proposée d'office, que le MJ peut changer */
  style: StyleId;
  /** Chaque création donne un résultat différent */
  random?: true;
}[] = [
  { id: "empty", label: "Vide", hint: "Une feuille blanche quadrillée.", style: "theme" },
  { id: "room", label: "Une salle", hint: "Une grande pièce, prête à meubler.", style: "theme" },
  {
    id: "house",
    label: "Maison",
    hint: "Quelques pièces reliées par des portes.",
    style: "parchment",
  },
  {
    id: "building",
    label: "Bâtiment",
    hint: "Un couloir central et des bureaux de chaque côté.",
    style: "blueprint",
  },
  {
    id: "cave",
    label: "Grotte",
    hint: "Des cavités naturelles aux bords irréguliers.",
    style: "theme",
    random: true,
  },
  {
    id: "dungeon",
    label: "Donjon",
    hint: "Des salles et des couloirs tirés au hasard.",
    style: "hatch",
    random: true,
  },
];

const rect = (x: number, y: number, w: number, h: number): MapShape => ({
  t: "rect",
  pts: [
    { x, y },
    { x: x + w, y: y + h },
  ],
});
/** Mur horizontal sur la ligne `y`, de la colonne `x0` à `x1` (exclue) ; `doors` : colonnes de porte. */
function hLine(x0: number, x1: number, y: number, doors: number[] = []): MapEdge[] {
  const out: MapEdge[] = [];
  for (let x = x0; x < x1; x++)
    out.push({ x, y, dir: "h", kind: doors.includes(x) ? "door" : "wall" });
  return out;
}
/** Mur vertical sur la ligne `x`, de la rangée `y0` à `y1` (exclue) ; `doors` : rangées de porte. */
function vLine(x: number, y0: number, y1: number, doors: number[] = []): MapEdge[] {
  const out: MapEdge[] = [];
  for (let y = y0; y < y1; y++)
    out.push({ x, y, dir: "v", kind: doors.includes(y) ? "door" : "wall" });
  return out;
}
const label = (id: string, text: string, p: Point): MapObject => ({
  id,
  k: "text",
  text,
  x: p.x,
  y: p.y,
  w: 1,
  h: 0.7,
  r: 0,
});

/** Une salle au centre, avec un peu de place autour. */
function room(w: number, h: number): MapDraft {
  const rw = Math.max(6, w - 8);
  const rh = Math.max(5, h - 6);
  const x = Math.floor((w - rw) / 2);
  const y = Math.floor((h - rh) / 2);
  return { width: w, height: h, shapes: [rect(x, y, rw, rh)], edges: [], objects: [] };
}

/**
 * Maison : un rectangle coupé en pièces par des cloisons, chacune avec sa porte,
 * et un petit perron pour l'entrée.
 */
function house(w: number, h: number): MapDraft {
  const x0 = 3;
  const y0 = 2;
  const x1 = w - 3;
  const y1 = h - 4;
  const midX = x0 + Math.floor((x1 - x0) * 0.45);
  const midY = y0 + Math.floor((y1 - y0) / 2);
  const rightMid = midX + Math.floor((x1 - midX) / 2);
  const entry = x0 + Math.floor((midX - x0) / 2);
  return {
    width: w,
    height: h,
    shapes: [rect(x0, y0, x1 - x0, y1 - y0), rect(entry, y1, 1, 2)],
    edges: [
      // Cloison entre la grande salle (à gauche) et le reste
      ...vLine(midX, y0, y1, [y0 + 2, midY + 2]),
      // Cloison entre les pièces de droite, en haut et en bas
      ...hLine(midX, x1, midY, [rightMid + 1]),
      // Deux chambres en haut à droite
      ...vLine(rightMid, y0, midY, [y0 + 1]),
      // L'entrée
      { x: entry, y: y1, dir: "h", kind: "door" },
    ],
    objects: [
      label("t1", "Séjour", { x: (x0 + midX) / 2, y: (y0 + y1) / 2 }),
      label("t2", "Chambre", { x: (midX + rightMid) / 2, y: (y0 + midY) / 2 }),
      label("t3", "Chambre", { x: (rightMid + x1) / 2, y: (y0 + midY) / 2 }),
      label("t4", "Cuisine", { x: (midX + x1) / 2, y: (midY + y1) / 2 }),
    ],
  };
}

/** Bâtiment : un couloir de deux cases au milieu, des bureaux de chaque côté. */
function building(w: number, h: number): MapDraft {
  const x0 = 2;
  const x1 = w - 2;
  const y0 = 2;
  const y1 = h - 2;
  const cy = Math.floor((y0 + y1) / 2) - 1;
  const span = x1 - x0;
  const count = Math.max(2, Math.floor(span / 6));
  const edges: MapEdge[] = [];
  const objects: MapObject[] = [];
  const cuts = Array.from(
    { length: count - 1 },
    (_, i) => x0 + Math.round((span * (i + 1)) / count),
  );
  const bounds = [x0, ...cuts, x1];
  const topDoors: number[] = [];
  const bottomDoors: number[] = [];
  for (let i = 0; i < count; i++) {
    const a = bounds[i]!;
    const b = bounds[i + 1]!;
    const mid = Math.floor((a + b) / 2);
    topDoors.push(mid);
    bottomDoors.push(mid);
    objects.push(label(`a${i}`, String(100 + i + 1), { x: (a + b) / 2, y: (y0 + cy) / 2 }));
    objects.push(label(`b${i}`, String(200 + i + 1), { x: (a + b) / 2, y: (cy + 2 + y1) / 2 }));
  }
  edges.push(...hLine(x0, x1, cy, topDoors), ...hLine(x0, x1, cy + 2, bottomDoors));
  for (const x of cuts) edges.push(...vLine(x, y0, cy), ...vLine(x, cy + 2, y1));
  return { width: w, height: h, shapes: [rect(x0, y0, span, y1 - y0)], edges, objects };
}

/** Grotte : des cavités rondes qui se chevauchent le long d'une marche au hasard. */
function cave(w: number, h: number, seed: number): MapDraft {
  const rand = random(seed);
  const shapes: MapShape[] = [];
  let p = { x: w / 2, y: h / 2 };
  const count = Math.round((w * h) / 28);
  const centers: Point[] = [];
  for (let i = 0; i < count; i++) {
    const r = 1.5 + rand() * 2;
    shapes.push({
      t: "ellipse",
      pts: [p, { x: p.x + r, y: p.y }],
      wear: 2,
    });
    centers.push(p);
    // De temps en temps, une nouvelle galerie part d'une cavité déjà creusée
    if (i > 3 && rand() < 0.15) p = centers[Math.floor(rand() * centers.length)]!;
    // Le pas reste plus court que la somme des rayons : chaque cavité touche la précédente
    const a = rand() * Math.PI * 2;
    const step = Math.min(r, 2) * 1.2;
    p = {
      x: Math.min(w - 4, Math.max(4, p.x + Math.cos(a) * step)),
      y: Math.min(h - 4, Math.max(4, p.y + Math.sin(a) * step)),
    };
  }
  return { width: w, height: h, shapes, edges: [], objects: [] };
}

/** Construit le modèle choisi. `seed` ne sert qu'aux modèles tirés au hasard. */
export function buildTemplate(id: TemplateId, size: TemplateSize, seed = 1): MapDraft {
  const z = TEMPLATE_SIZES.find((s) => s.id === size) ?? TEMPLATE_SIZES[1]!;
  if (id === "room") return room(z.w, z.h);
  if (id === "house") return house(z.w, z.h);
  if (id === "building") return building(z.w, z.h);
  if (id === "cave") return cave(z.w, z.h, seed);
  if (id === "dungeon") {
    const d = generateDungeon(
      { ...DEFAULT_DUNGEON, size, rooms: size === "s" ? 5 : size === "m" ? 8 : 12 },
      seed,
    );
    return {
      width: d.width,
      height: d.height,
      shapes: d.shapes,
      edges: d.edges,
      objects: d.objects,
    };
  }
  return { width: z.w, height: z.h, shapes: [], edges: [], objects: [] };
}
