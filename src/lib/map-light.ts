/**
 * Éclairage et brouillard à la main, sans affichage ni base.
 * La lumière est un rendu : elle ne décide pas de ce que la base envoie aux joueurs.
 * Le brouillard à la main cache des cases à l'écran des joueurs, case par case.
 */
import { MAP_MAX, reachableCells, type MapEdge, type Point, type Segment } from "@/lib/map";
import type { MapObject } from "@/lib/map-objects";

export type LightSettings = {
  on: boolean;
  /** Couleur de la nuit */
  night: string;
  /** Obscurité hors des lumières, de 0 à 1 */
  dark: number;
  /** Portée de la lumière des pions du groupe, en cases ; 0 = ils n'éclairent pas */
  party: number;
};
export const DEFAULT_LIGHT: LightSettings = { on: false, night: "#0b1030", dark: 0.85, party: 0 };

const COLOR = /^#[0-9a-f]{6}$/i;
const num = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

/** Lit la colonne `light` ; une valeur illisible reprend la valeur par défaut. */
export function readLight(raw: unknown): LightSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    on: o["on"] === true,
    night:
      typeof o["night"] === "string" && COLOR.test(o["night"]) ? o["night"] : DEFAULT_LIGHT.night,
    dark: num(o["dark"], 0, 1, DEFAULT_LIGHT.dark),
    party: num(o["party"], 0, 60, 0),
  };
}

/** Tailles de lumière neutres, en cases : aucune règle de jeu ici, le MJ ajuste la portée. */
export const LIGHT_SIZES = [
  { label: "Petite", rad: 2 },
  { label: "Moyenne", rad: 4 },
  { label: "Grande", rad: 8 },
];

export type LightSource = {
  x: number;
  y: number;
  rad: number;
  bright: number;
  color: string | null;
  power: number;
};

/** Sources du moment : les lumières posées, puis les pions du groupe s'ils éclairent. */
export function lightSources(
  objects: MapObject[],
  party: Point[],
  settings: LightSettings,
): LightSource[] {
  const placed = objects
    .filter((o) => o.k === "light")
    .map((o) => ({
      x: o.x,
      y: o.y,
      rad: o.rad ?? 4,
      bright: o.bright ?? 0.5,
      color: o.color ?? null,
      power: o.op ?? 1,
    }));
  const carried =
    settings.party > 0
      ? party.map((p) => ({ ...p, rad: settings.party, bright: 0.5, color: null, power: 1 }))
      : [];
  return [...placed, ...carried];
}

// ---- Brouillard à la main : une case révélée = un bit, sur une grille fixe de 100 × 100

const STRIDE = MAP_MAX;
const BYTES = (STRIDE * STRIDE) / 8;

export const emptyMask = () => new Uint8Array(BYTES);

export function readMask(raw: unknown): Uint8Array {
  const out = emptyMask();
  if (typeof raw !== "string" || !raw) return out;
  try {
    const bin = atob(raw);
    for (let i = 0; i < Math.min(bin.length, BYTES); i++) out[i] = bin.charCodeAt(i);
  } catch {
    /* masque illisible : tout reste caché */
  }
  return out;
}

export function maskToText(mask: Uint8Array) {
  let bin = "";
  for (let i = 0; i < mask.length; i++) bin += String.fromCharCode(mask[i]!);
  return btoa(bin);
}

const bit = (x: number, y: number) => y * STRIDE + x;
export const isRevealed = (mask: Uint8Array, x: number, y: number) =>
  x >= 0 &&
  y >= 0 &&
  x < STRIDE &&
  y < STRIDE &&
  (mask[bit(x, y) >> 3]! & (1 << (bit(x, y) & 7))) !== 0;

function setCell(mask: Uint8Array, x: number, y: number, on: boolean) {
  if (x < 0 || y < 0 || x >= STRIDE || y >= STRIDE) return;
  const i = bit(x, y);
  if (on) mask[i >> 3] = mask[i >> 3]! | (1 << (i & 7));
  else mask[i >> 3] = mask[i >> 3]! & ~(1 << (i & 7));
}

/** Pinceau : chaque case dont le centre est à moins de `radius` cases du pointeur. */
export function paintMask(
  mask: Uint8Array,
  p: Point,
  radius: number,
  reveal: boolean,
  w: number,
  h: number,
) {
  const next = new Uint8Array(mask);
  const r = Math.max(0.5, radius);
  for (let y = Math.max(0, Math.floor(p.y - r)); y <= Math.min(h - 1, Math.floor(p.y + r)); y++)
    for (let x = Math.max(0, Math.floor(p.x - r)); x <= Math.min(w - 1, Math.floor(p.x + r)); x++)
      if (Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) <= r) setCell(next, x, y, reveal);
  return next;
}

/** Toute la pièce touchée, jusqu'aux murs et aux portes fermées. */
export function revealRoom(
  mask: Uint8Array,
  p: Point,
  edges: MapEdge[],
  walls: Segment[],
  w: number,
  h: number,
  reveal: boolean,
) {
  const next = new Uint8Array(mask);
  for (const key of reachableCells(p, edges, w, h, walls)) {
    const [x, y] = key.split(":").map(Number) as [number, number];
    setCell(next, x, y, reveal);
  }
  return next;
}

export function fillMask(reveal: boolean, w: number, h: number) {
  const next = emptyMask();
  if (reveal) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) setCell(next, x, y, true);
  return next;
}

/** Cases encore cachées, au format des cases de la vision (« x:y »). */
export function hiddenCells(mask: Uint8Array, w: number, h: number) {
  const out = new Set<string>();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (!isRevealed(mask, x, y)) out.add(`${x}:${y}`);
  return out;
}
