/**
 * Calques et étages d'une carte, sans affichage ni base.
 * Le calque principal, ce sont les sols et objets de la carte elle-même (identifiant null) ;
 * les autres calques s'empilent par-dessus, dans l'ordre de leur position.
 */
import type { Point } from "@/lib/map";
import type { MapObject } from "@/lib/map-objects";
import type { MapShape } from "@/lib/map-shapes";

export const LAYERS_MAX = 20;
export const MAIN_LAYER = "Calque principal";

export type LayerView = {
  /** null : le calque principal */
  id: string | null;
  name: string;
  hidden: boolean;
  locked: boolean;
  shapes: MapShape[];
  objects: MapObject[];
};

/** Sols de tous les calques visibles, dans l'ordre : un calque peut creuser ceux du dessous. */
export const visibleShapes = (views: LayerView[]) =>
  views.filter((v) => !v.hidden).flatMap((v) => v.shapes);

/** Sols des calques cachés aux joueurs : le MJ les voit en transparence. */
export const hiddenShapes = (views: LayerView[]) =>
  views.filter((v) => v.hidden).flatMap((v) => v.shapes);

/** Position d'un nouveau calque : tout en haut. */
export const nextPosition = (rows: { position: number }[]) =>
  rows.reduce((max, r) => Math.max(max, r.position + 1), 0);

/** Échange un calque avec son voisin du dessus (+1) ou du dessous (-1). */
export function swapLayer<T extends { id: string; position: number }>(
  rows: T[],
  id: string,
  dir: 1 | -1,
): [T, T] | null {
  const sorted = [...rows].sort((a, b) => a.position - b.position);
  const i = sorted.findIndex((r) => r.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sorted.length) return null;
  const a = sorted[i]!;
  const b = sorted[j]!;
  // Positions égales (calques créés ensemble) : on les départage par l'ordre affiché
  const pa = a.position === b.position ? j : b.position;
  const pb = a.position === b.position ? i : a.position;
  return [
    { ...a, position: pa },
    { ...b, position: pb },
  ];
}

export type Floor = { id: string; place: string | null; level: number };

/** « Niveau 2 », « Niveau -1 » : le nom du lieu vient de la carte, jamais du code. */
export const levelLabel = (level: number) => `Niveau ${level}`;

/** Étage voisin du même lieu, au-dessus (+1) ou en dessous (-1) ; null s'il n'y en a pas. */
export function neighborFloor<T extends Floor>(maps: T[], current: T, dir: 1 | -1): T | null {
  const place = current.place?.trim().toLowerCase();
  if (!place) return null;
  let best: T | null = null;
  for (const m of maps) {
    if (m.id === current.id || m.place?.trim().toLowerCase() !== place) continue;
    const gap = (m.level - current.level) * dir;
    if (gap <= 0) continue;
    if (!best || gap < (best.level - current.level) * dir) best = m;
  }
  return best;
}

/** Places autour d'un point pour poser le groupe : le centre, puis en couronne. */
export function partySpots(c: Point, n: number, w: number, h: number): Point[] {
  const ring = [
    [0, 0],
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ];
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const [dx, dy] = ring[i % ring.length]!;
    const k = 1 + Math.floor(i / ring.length);
    out.push({
      x: Math.min(w - 0.5, Math.max(0.5, c.x + dx! * k)),
      y: Math.min(h - 0.5, Math.max(0.5, c.y + dy! * k)),
    });
  }
  return out;
}
