/**
 * Donjon aléatoire : des pièces qui poussent l'une à côté de l'autre, reliées par des couloirs.
 * Tout dépend du tirage (`seed`) : le même tirage redonne le même donjon.
 * Le résultat est fait de formes, de portes et de textes ordinaires, à retoucher ensuite.
 */
import { inPolygon, type MapEdge, type Point } from "@/lib/map";
import type { MapObject } from "@/lib/map-objects";
import { floorOf, shapePolygons, type MapShape } from "@/lib/map-shapes";

export type DungeonOptions = {
  size: "s" | "m" | "l";
  rooms: number;
  roomSize: "tight" | "normal" | "wide";
  corridor: "short" | "normal" | "long";
  corridorWidth: 1 | 2;
  layout: "line" | "branch" | "balanced" | "winding";
  /** Part des entrées de pièce qui reçoivent une porte, de 0 à 1 */
  doors: number;
  shapes: { square: boolean; irregular: boolean; round: boolean };
  wear: number;
  numbers: boolean;
};

export const DEFAULT_DUNGEON: DungeonOptions = {
  size: "m",
  rooms: 7,
  roomSize: "normal",
  corridor: "normal",
  corridorWidth: 1,
  layout: "balanced",
  doors: 0.5,
  shapes: { square: true, irregular: false, round: false },
  wear: 0,
  numbers: true,
};

export const DUNGEON_SIZES = { s: { w: 24, h: 16 }, m: { w: 36, h: 24 }, l: { w: 50, h: 34 } };
const ROOM_SIZES = { tight: [3, 5], normal: [4, 7], wide: [6, 10] } as const;
const GAPS = { short: [1, 2], normal: [2, 4], long: [4, 7] } as const;

/** Tirage pseudo-aléatoire stable (mulberry32). */
export function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Room = { x: number; y: number; w: number; h: number };
export type Dungeon = {
  width: number;
  height: number;
  rooms: Room[];
  links: [number, number][];
  shapes: MapShape[];
  edges: MapEdge[];
  objects: MapObject[];
};

const overlaps = (a: Room, b: Room, gap: number) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
const centerOf = (r: Room): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

export function generateDungeon(o: DungeonOptions, seed: number): Dungeon {
  const rand = random(seed);
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)]!;
  const { w: width, h: height } = DUNGEON_SIZES[o.size];
  const [rmin, rmax] = ROOM_SIZES[o.roomSize];
  const [gmin, gmax] = GAPS[o.corridor];
  const cw = o.corridorWidth;
  const fits = (r: Room) =>
    r.x >= 1 && r.y >= 1 && r.x + r.w <= width - 1 && r.y + r.h <= height - 1;

  // 1. Les pièces poussent à côté d'une pièce déjà posée
  const rooms: Room[] = [];
  const links: [number, number][] = [];
  const first = { w: int(rmin, rmax), h: int(rmin, rmax) };
  rooms.push({
    ...first,
    x: Math.floor((width - first.w) / 2),
    y: Math.floor((height - first.h) / 2),
  });
  const chain = o.layout === "line" || o.layout === "winding";
  let stuck = 0;
  for (let tries = 0; rooms.length < o.rooms && tries < o.rooms * 80; tries++) {
    // En ligne, on part toujours de la dernière pièce, sauf si elle est coincée
    const from = chain && stuck < 40 ? rooms.length - 1 : Math.floor(rand() * rooms.length);
    const p = rooms[from]!;
    const w = int(rmin, rmax);
    const h = int(rmin, rmax);
    const gap = int(gmin, gmax);
    const dir = int(0, 3);
    // Les deux pièces se font face sur au moins la largeur d'un couloir : couloir droit
    const slideY = int(-(h - cw), p.h - cw);
    const slideX = int(-(w - cw), p.w - cw);
    const r: Room =
      dir === 0
        ? { x: p.x + p.w + gap, y: p.y + slideY, w, h }
        : dir === 1
          ? { x: p.x - gap - w, y: p.y + slideY, w, h }
          : dir === 2
            ? { x: p.x + slideX, y: p.y + p.h + gap, w, h }
            : { x: p.x + slideX, y: p.y - gap - h, w, h };
    if (!fits(r) || rooms.some((q) => overlaps(q, r, 1))) {
      stuck++;
      continue;
    }
    stuck = 0;
    rooms.push(r);
    links.push([from, rooms.length - 1]);
  }
  // Disposition équilibrée : quelques boucles entre pièces proches
  if (o.layout === "balanced")
    for (let i = 0; i < rooms.length; i++)
      for (let j = i + 1; j < rooms.length; j++) {
        if (links.some(([a, b]) => (a === i && b === j) || (a === j && b === i))) continue;
        const a = centerOf(rooms[i]!);
        const b = centerOf(rooms[j]!);
        const near = Math.hypot(a.x - b.x, a.y - b.y) < (rmax + gmax) * 1.6;
        if (near && rand() < 0.3 && links.length < rooms.length * 1.4) links.push([i, j]);
      }

  // 2. Pièces : carrées, irrégulières ou arrondies, selon les formes choisies
  const kinds = (["square", "irregular", "round"] as const).filter((k) => o.shapes[k]);
  const wear = o.wear > 0 ? { wear: o.wear } : {};
  const roomShapes = rooms.map((r): MapShape => {
    const kind = kinds.length ? pick(kinds) : "square";
    const a = { x: r.x, y: r.y };
    const b = { x: r.x + r.w, y: r.y + r.h };
    if (kind === "round") {
      if (Math.abs(r.w - r.h) <= 1) {
        const c = centerOf(r);
        return { t: "ellipse", pts: [c, { x: c.x + Math.min(r.w, r.h) / 2, y: c.y }], ...wear };
      }
      return { t: "rect", pts: [a, b], round: Math.min(r.w, r.h) / 4, ...wear };
    }
    if (kind === "irregular" && r.w >= 4 && r.h >= 4) {
      // Un coin entaillé, jamais jusqu'au centre : les couloirs partent du centre
      const nw = int(1, Math.floor((r.w - 1) / 2));
      const nh = int(1, Math.floor((r.h - 1) / 2));
      const corner = int(0, 3);
      const pts: Point[] = [
        { x: r.x, y: r.y },
        { x: r.x + r.w, y: r.y },
        { x: r.x + r.w, y: r.y + r.h },
        { x: r.x, y: r.y + r.h },
      ];
      const c = pts[corner]!;
      const prev = pts[(corner + 3) % 4]!;
      const next = pts[(corner + 1) % 4]!;
      const toward = (from: Point, to: Point, n: number) => ({
        x: from.x + Math.sign(to.x - from.x) * n,
        y: from.y + Math.sign(to.y - from.y) * n,
      });
      const alongPrev = toward(c, prev, prev.x === c.x ? nh : nw);
      const alongNext = toward(c, next, next.x === c.x ? nh : nw);
      const inner = {
        x: alongPrev.x !== c.x ? alongPrev.x : alongNext.x,
        y: alongPrev.y !== c.y ? alongPrev.y : alongNext.y,
      };
      const ring = pts.flatMap((p, i) => (i === corner ? [alongPrev, inner, alongNext] : [p]));
      return { t: "poly", pts: ring, ...wear };
    }
    return { t: "rect", pts: [a, b], ...wear };
  });
  const rings = roomShapes.map((s) => (shapePolygons(s)[0]?.[0] ?? []).map(([x, y]) => ({ x, y })));
  const inRoom = (i: number, cell: Point) =>
    inPolygon({ x: cell.x + 0.5, y: cell.y + 0.5 }, rings[i]!);

  // 3. Couloirs : droits quand les pièces se font face, sinon en L (ou en zigzag si sinueux)
  const off = cw % 2 === 1 ? 0.5 : 0;
  const snap = (v: number) => Math.floor(v - off) + off;
  const corridors: { pts: Point[]; a: number; b: number }[] = links.map(([i, j]) => {
    const A = rooms[i]!;
    const B = rooms[j]!;
    const ca = { x: snap(A.x + A.w / 2), y: snap(A.y + A.h / 2) };
    const cb = { x: snap(B.x + B.w / 2), y: snap(B.y + B.h / 2) };
    const y0 = Math.max(A.y, B.y);
    const y1 = Math.min(A.y + A.h, B.y + B.h);
    const x0 = Math.max(A.x, B.x);
    const x1 = Math.min(A.x + A.w, B.x + B.w);
    if (y1 - y0 >= cw && o.layout !== "winding") {
      const y = snap((y0 + y1) / 2);
      return {
        pts: [
          { x: ca.x, y },
          { x: cb.x, y },
        ],
        a: i,
        b: j,
      };
    }
    if (x1 - x0 >= cw && o.layout !== "winding") {
      const x = snap((x0 + x1) / 2);
      return {
        pts: [
          { x, y: ca.y },
          { x, y: cb.y },
        ],
        a: i,
        b: j,
      };
    }
    if (o.layout === "winding") {
      const mid = {
        x: snap((ca.x + cb.x) / 2 + int(-2, 2)),
        y: snap((ca.y + cb.y) / 2 + int(-2, 2)),
      };
      return {
        pts: [ca, { x: mid.x, y: ca.y }, mid, { x: mid.x, y: cb.y }, cb],
        a: i,
        b: j,
      };
    }
    const corner = rand() < 0.5 ? { x: cb.x, y: ca.y } : { x: ca.x, y: cb.y };
    return { pts: [ca, corner, cb], a: i, b: j };
  });
  const corridorShapes: MapShape[] = corridors.map((c) => ({
    t: "path",
    width: cw,
    pts: c.pts,
    ...wear,
  }));

  // 4. Portes : là où un couloir étroit sort d'une pièce, et seulement si le passage
  // est un vrai goulet. La case devant la porte est hors de toute pièce et n'a pas de sol
  // sur ses côtés : sinon on contournerait la porte (couloir qui longe une pièce, croise
  // un autre couloir ou débouche dans une autre salle).
  const edges = new Map<string, MapEdge>();
  const floorCells = new Set<string>();
  if (cw === 1 && o.doors > 0) {
    const floor = floorOf([...roomShapes, ...corridorShapes], width, height);
    const ring = (r: [number, number][]) => r.map(([x, y]) => ({ x, y }));
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const p = { x: x + 0.5, y: y + 0.5 };
        if (
          floor.some(
            ([outer, ...holes]) =>
              !!outer && inPolygon(p, ring(outer)) && !holes.some((h) => inPolygon(p, ring(h))),
          )
        )
          floorCells.add(`${x}:${y}`);
      }
  }
  const isFloor = (c: Point) => floorCells.has(`${c.x}:${c.y}`);
  const inAnyRoom = (c: Point) => rooms.some((_, i) => inRoom(i, c));
  /** La porte entre la case de la pièce `a` et la case `b` qui la suit ferme-t-elle vraiment le passage ? */
  const chokepoint = (a: Point, b: Point) => {
    if (inAnyRoom(b)) return false;
    const side = a.x !== b.x ? { x: 0, y: 1 } : { x: 1, y: 0 };
    return (
      !isFloor({ x: b.x + side.x, y: b.y + side.y }) &&
      !isFloor({ x: b.x - side.x, y: b.y - side.y })
    );
  };
  if (cw === 1 && o.doors > 0)
    for (const c of corridors) {
      const cells = walk(c.pts);
      for (const [room, list] of [
        [c.a, cells],
        [c.b, [...cells].reverse()],
      ] as const) {
        const k = list.findIndex(
          (cell, n) => n > 0 && !inRoom(room, cell) && inRoom(room, list[n - 1]!),
        );
        if (k < 1 || rand() >= o.doors) continue;
        if (!chokepoint(list[k - 1]!, list[k]!)) continue;
        const e = edgeBetween(list[k - 1]!, list[k]!);
        edges.set(`${e.dir}:${e.x}:${e.y}`, e);
      }
    }

  // 5. Numéros de salle, dans l'ordre où les pièces ont poussé
  const objects: MapObject[] = o.numbers
    ? rooms.map((r, i) => {
        const c = centerOf(r);
        return {
          id: `n${i + 1}`,
          k: "text",
          text: String(i + 1),
          x: c.x,
          y: c.y,
          w: 1,
          h: 0.7,
          r: 0,
        };
      })
    : [];

  return {
    width,
    height,
    rooms,
    links,
    shapes: [...roomShapes, ...corridorShapes],
    edges: [...edges.values()],
    objects,
  };
}

/** Cases traversées par un tracé fait de segments droits passant par des centres de case. */
function walk(pts: Point[]): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = { x: Math.floor(pts[i]!.x), y: Math.floor(pts[i]!.y) };
    const b = { x: Math.floor(pts[i + 1]!.x), y: Math.floor(pts[i + 1]!.y) };
    const dx = Math.sign(b.x - a.x);
    const dy = Math.sign(b.y - a.y);
    let p = a;
    if (!out.length) out.push(p);
    while (p.x !== b.x || p.y !== b.y) {
      p = { x: p.x + (p.x !== b.x ? dx : 0), y: p.y + (p.x === b.x ? dy : 0) };
      out.push(p);
    }
  }
  return out;
}

/** Arête commune à deux cases voisines. */
function edgeBetween(a: Point, b: Point): MapEdge {
  if (b.x !== a.x) return { x: Math.max(a.x, b.x), y: a.y, dir: "v", kind: "door" };
  return { x: a.x, y: Math.max(a.y, b.y), dir: "h", kind: "door" };
}
