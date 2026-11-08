/**
 * Sols dessinés par formes : rectangles, cercles, couloirs et formes libres, en cases.
 * Les formes s'appliquent dans l'ordre : ajouter fusionne, creuser retire. Le contour obtenu
 * donne les murs, qui bloquent la vue comme les murs posés sur la grille.
 */
import polygonClipping, { type MultiPolygon, type Polygon, type Ring } from "polygon-clipping";
import { blocksView, type MapEdge, type Point, type Segment } from "@/lib/map";
import { MAP_LAYERS, type MapLayer } from "@/lib/map-style";

export const SHAPES_MAX = 1000;
export const SHAPE_POINTS_MAX = 1000;
export const WEAR_MAX = 3;

export type ShapeKind = "rect" | "ellipse" | "path" | "poly";
export const SHAPE_KINDS: { id: ShapeKind; label: string; hint: string }[] = [
  { id: "rect", label: "Rectangle", hint: "Glisse d’un coin à l’autre." },
  { id: "ellipse", label: "Cercle", hint: "Glisse du centre vers le bord." },
  {
    id: "path",
    label: "Couloir",
    hint: "Touche chaque point, double-clic ou Terminer pour finir.",
  },
  { id: "poly", label: "Forme libre", hint: "Touche chaque coin, reviens au premier pour fermer." },
];

/**
 * rect : deux coins opposés ; ellipse : le centre puis un point du bord ;
 * path : les points du couloir ; poly : les coins de la forme.
 */
export type MapShape = {
  t: ShapeKind;
  pts: Point[];
  /** Creuse au lieu d'ajouter */
  erase?: true;
  /** Rectangle : rayon des coins, en cases. Forme libre : contour arrondi (1). */
  round?: number;
  /** Cercle : 0 = rond, sinon nombre de côtés */
  sides?: number;
  /** Couloir : largeur en cases */
  width?: number;
  /** Couloir : relie les points par des courbes */
  curve?: true;
  /** Contour abîmé, de 0 à 3 */
  wear?: number;
  /** Matière : sol (par défaut, absent), eau, lave, végétation ou route */
  layer?: Exclude<MapLayer, "floor">;
};

const num = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : null;
const round2 = (n: number) => Math.round(n * 100) / 100;

function readPoint(raw: unknown): Point | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const x = num(Array.isArray(raw) ? raw[0] : o["x"], -10, 110);
  const y = num(Array.isArray(raw) ? raw[1] : o["y"], -10, 110);
  return x === null || y === null ? null : { x: round2(x), y: round2(y) };
}

/** Lit la colonne `shapes` ; une forme illisible est ignorée, jamais une erreur d'affichage. */
export function readShapes(raw: unknown): MapShape[] {
  if (!Array.isArray(raw)) return [];
  const out: MapShape[] = [];
  for (const item of raw.slice(0, SHAPES_MAX)) {
    const o = (item ?? {}) as Record<string, unknown>;
    const t = o["t"];
    if (t !== "rect" && t !== "ellipse" && t !== "path" && t !== "poly") continue;
    const pts = (Array.isArray(o["pts"]) ? o["pts"] : [])
      .slice(0, SHAPE_POINTS_MAX)
      .map(readPoint)
      .filter((p): p is Point => p !== null);
    const need = t === "rect" || t === "ellipse" ? 2 : t === "poly" ? 3 : 1;
    if (pts.length < need) continue;
    const shape: MapShape = { t, pts: t === "rect" || t === "ellipse" ? pts.slice(0, 2) : pts };
    if (o["erase"] === true) shape.erase = true;
    const roundness = num(o["round"], 0, 50);
    if (roundness && (t === "rect" || t === "poly")) shape.round = roundness;
    const sides = num(o["sides"], 0, 12);
    if (t === "ellipse" && sides && sides >= 3) shape.sides = Math.round(sides);
    const width = num(o["width"], 0.25, 10);
    if (t === "path") shape.width = width ?? 1;
    if (t === "path" && o["curve"] === true) shape.curve = true;
    const wear = num(o["wear"], 0, WEAR_MAX);
    if (wear) shape.wear = Math.round(wear);
    const layer = o["layer"];
    if (layer !== "floor" && MAP_LAYERS.some((l) => l.id === layer))
      shape.layer = layer as Exclude<MapLayer, "floor">;
    out.push(shape);
  }
  return out;
}

/** Formes prêtes à enregistrer : chaque point en [x, y], plus court en base. */
export const shapesToJson = (shapes: MapShape[]) =>
  readShapes(shapes).map((s) => ({ ...s, pts: s.pts.map((p) => [p.x, p.y]) }));

/** Aimante un point : sur la grille (1), la demi-case (0.5) ou librement (0). */
export function snapPoint(p: Point, step: number, w: number, h: number, offset = 0): Point {
  const fit = (v: number, max: number) => {
    const snapped = step > 0 ? Math.round((v - offset) / step) * step + offset : round2(v);
    return Math.min(max, Math.max(0, snapped));
  };
  return { x: fit(p.x, w), y: fit(p.y, h) };
}

/** Couloir de largeur impaire sur la grille : ses points vont au centre des cases. */
export const pathOffset = (width: number, step: number) =>
  step === 1 && Math.round(width) % 2 === 1 ? 0.5 : 0;

const pair = (p: Point): [number, number] => [p.x, p.y];

function arc(c: Point, r: number, from: number, to: number, steps: number): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / steps;
    return { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r };
  });
}

function rectRing(a: Point, b: Point, radius: number): Point[] {
  const l = Math.min(a.x, b.x);
  const r = Math.max(a.x, b.x);
  const t = Math.min(a.y, b.y);
  const btm = Math.max(a.y, b.y);
  const k = Math.min(radius, (r - l) / 2, (btm - t) / 2);
  if (k <= 0)
    return [
      { x: l, y: t },
      { x: r, y: t },
      { x: r, y: btm },
      { x: l, y: btm },
    ];
  const steps = Math.max(3, Math.min(12, Math.round(k * 6)));
  const q = Math.PI / 2;
  return [
    ...arc({ x: r - k, y: t + k }, k, -q, 0, steps),
    ...arc({ x: r - k, y: btm - k }, k, 0, q, steps),
    ...arc({ x: l + k, y: btm - k }, k, q, 2 * q, steps),
    ...arc({ x: l + k, y: t + k }, k, 2 * q, 3 * q, steps),
  ];
}

function ellipseRing(c: Point, edge: Point, sides: number): Point[] {
  const r = Math.hypot(edge.x - c.x, edge.y - c.y);
  const n = sides >= 3 ? sides : Math.max(20, Math.min(48, Math.round(r * 8)));
  // Un polygone régulier pointe vers le point tiré : on choisit son orientation en glissant
  const start = sides >= 3 ? Math.atan2(edge.y - c.y, edge.x - c.x) : 0;
  return arc(c, r, start, start + 2 * Math.PI, n).slice(0, n);
}

/** Courbe passant par chaque point (Catmull-Rom). */
function smoothOpen(pts: Point[]): Point[] {
  if (pts.length < 3) return pts;
  const out: Point[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const steps = Math.max(4, Math.min(16, Math.round(Math.hypot(p2.x - p1.x, p2.y - p1.y) * 3)));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 *
        (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  out.push(pts.at(-1)!);
  return out;
}

/** Contour adouci d'une forme fermée (coins coupés trois fois). */
function smoothClosed(pts: Point[]): Point[] {
  let ring = pts;
  for (let k = 0; k < 3; k++)
    ring = ring.flatMap((p, i) => {
      const q = ring[(i + 1) % ring.length]!;
      return [
        { x: p.x * 0.75 + q.x * 0.25, y: p.y * 0.75 + q.y * 0.25 },
        { x: p.x * 0.25 + q.x * 0.75, y: p.y * 0.25 + q.y * 0.75 },
      ];
    });
  return ring;
}

/** Couloir : un ruban par tronçon, prolongé d'une demi-largeur pour des angles nets. */
function pathPolygons(s: MapShape): Polygon[] {
  const hw = (s.width ?? 1) / 2;
  const pts = s.curve ? smoothOpen(s.pts) : s.pts;
  if (pts.length === 1) {
    const p = pts[0]!;
    return [[rectRing({ x: p.x - hw, y: p.y - hw }, { x: p.x + hw, y: p.y + hw }, 0).map(pair)]];
  }
  const out: Polygon[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) continue;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    // Courbe : tronçons courts, des jointures rondes évitent les dents
    const ext = s.curve ? 0 : hw;
    const a2 = { x: a.x - ux * ext, y: a.y - uy * ext };
    const b2 = { x: b.x + ux * ext, y: b.y + uy * ext };
    const nx = -uy * hw;
    const ny = ux * hw;
    out.push([
      [
        [a2.x + nx, a2.y + ny],
        [b2.x + nx, b2.y + ny],
        [b2.x - nx, b2.y - ny],
        [a2.x - nx, a2.y - ny],
      ],
    ]);
    if (s.curve)
      out.push([
        arc(b, hw, 0, 2 * Math.PI, 12)
          .slice(0, 12)
          .map(pair),
      ]);
  }
  if (s.curve)
    out.push([
      arc(pts[0]!, hw, 0, 2 * Math.PI, 12)
        .slice(0, 12)
        .map(pair),
    ]);
  return out;
}

/** Bruit stable selon la position : chaque écran dessine la même usure. */
function noise(x: number, y: number) {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
}

/** Contour abîmé : coupé en petits pas, chaque point écarté un peu de sa place. */
function wearRing(ring: Point[], wear: number): Point[] {
  const amp = 0.06 * wear;
  const out: Point[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.round(len / 0.5));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      out.push({ x: x + noise(x, y) * amp, y: y + noise(y + 3.1, x) * amp });
    }
  }
  return out;
}

/** Polygones d'une forme, en cases. */
export function shapePolygons(s: MapShape): Polygon[] {
  const [a, b] = s.pts as [Point, Point];
  let rings: Point[][];
  if (s.t === "path") {
    const polys = pathPolygons(s);
    if (!s.wear) return polys;
    rings = union(polys).map((p) => p[0]!.map(([x, y]) => ({ x, y })));
  } else if (s.t === "rect") rings = [rectRing(a, b, s.round ?? 0)];
  else if (s.t === "ellipse") rings = [ellipseRing(a, b, s.sides ?? 0)];
  else rings = [s.round ? smoothClosed(s.pts) : s.pts];
  return rings.map((r) => [(s.wear ? wearRing(r, s.wear) : r).map(pair)]);
}

/** Aire d'une forme : une forme sans surface (simple clic) n'est pas enregistrée. */
export function shapeArea(s: MapShape) {
  let area = 0;
  for (const poly of shapePolygons(s))
    for (const [i, ring] of poly.entries()) {
      let a = 0;
      for (let k = 0; k < ring.length; k++) {
        const p = ring[k]!;
        const q = ring[(k + 1) % ring.length]!;
        a += p[0] * q[1] - q[0] * p[1];
      }
      area += (i === 0 ? 1 : -1) * Math.abs(a / 2);
    }
  return area;
}

function union(polys: Polygon[]): MultiPolygon {
  if (!polys.length) return [];
  try {
    return polygonClipping.union(polys[0]!, ...polys.slice(1));
  } catch {
    return polys;
  }
}

/**
 * Sol de la carte : les formes appliquées dans l'ordre, rognées au bord de la carte.
 * Une forme que le calcul refuse est sautée, les autres restent.
 */
export function floorOf(
  shapes: MapShape[],
  w: number,
  h: number,
  layer: MapLayer = "floor",
): MultiPolygon {
  let floor: MultiPolygon = [];
  let batch: Polygon[] = [];
  const flush = () => {
    if (!batch.length) return;
    try {
      floor = polygonClipping.union(floor, ...batch);
    } catch {
      for (const p of batch)
        try {
          floor = polygonClipping.union(floor, p);
        } catch {
          /* forme illisible : ignorée */
        }
    }
    batch = [];
  };
  for (const s of shapes) {
    if ((s.layer ?? "floor") !== layer) continue;
    const polys = shapePolygons(s);
    if (!s.erase) {
      batch.push(...polys);
      continue;
    }
    flush();
    try {
      floor = polygonClipping.difference(floor, ...polys);
    } catch {
      /* forme illisible : ignorée */
    }
  }
  flush();
  if (!floor.length) return floor;
  const bounds: Ring = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  try {
    return polygonClipping.intersection(floor, [bounds]);
  } catch {
    return floor;
  }
}

/** Tracé SVG d'un sol (règle de remplissage evenodd), à l'échelle d'une case en pixels. */
export function floorPath(floor: MultiPolygon | Polygon[], cell: number) {
  return floor
    .flatMap((poly) =>
      poly.map(
        (ring) =>
          "M" + ring.map(([x, y]) => `${round2(x * cell)},${round2(y * cell)}`).join("L") + "Z",
      ),
    )
    .join("");
}

/** Murs du sol : chaque côté de chaque contour. */
export function floorSegments(floor: MultiPolygon): Segment[] {
  const out: Segment[] = [];
  for (const poly of floor)
    for (const ring of poly) {
      // polygon-clipping referme ses contours : le dernier point répète le premier
      const n = ring.length;
      for (let i = 0; i < n - 1; i++) {
        const [ax, ay] = ring[i]!;
        const [bx, by] = ring[i + 1]!;
        if (ax !== bx || ay !== by) out.push({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
      }
    }
  return out;
}

const EPS = 1e-6;

/**
 * Les portes posées sur un mur du sol l'ouvrent : une porte ouverte ou une grille
 * laisse passer la vue. Renvoie aussi les portes posées sur un mur, pour y dessiner un passage.
 */
export function cutByDoors(segments: Segment[], edges: MapEdge[]) {
  const doors = edges.filter((e) => e.kind === "door" && e.dir !== "c");
  const onWall = new Set<string>();
  let out = segments;
  for (const d of doors) {
    const horizontal = d.dir === "h";
    const line = horizontal ? d.y : d.x;
    const from = horizontal ? d.x : d.y;
    const to = from + 1;
    const opens = !blocksView(d);
    const next: Segment[] = [];
    for (const s of out) {
      const along = horizontal
        ? Math.abs(s.a.y - line) < EPS && Math.abs(s.b.y - line) < EPS
        : Math.abs(s.a.x - line) < EPS && Math.abs(s.b.x - line) < EPS;
      const lo = horizontal ? Math.min(s.a.x, s.b.x) : Math.min(s.a.y, s.b.y);
      const hi = horizontal ? Math.max(s.a.x, s.b.x) : Math.max(s.a.y, s.b.y);
      if (!along || hi <= from + EPS || lo >= to - EPS) {
        next.push(s);
        continue;
      }
      onWall.add(`${d.dir}:${d.x}:${d.y}`);
      if (!opens) {
        next.push(s);
        continue;
      }
      const at = (v: number): Point => (horizontal ? { x: v, y: line } : { x: line, y: v });
      if (lo < from - EPS) next.push({ a: at(lo), b: at(from) });
      if (hi > to + EPS) next.push({ a: at(to), b: at(hi) });
    }
    out = next;
  }
  return { segments: out, onWall };
}

/** Une forme en cours de tracé, vue en fantôme. */
export function previewPath(s: MapShape, cell: number) {
  return floorPath(s.t === "path" && !s.wear ? union(shapePolygons(s)) : shapePolygons(s), cell);
}

/** Réglages de l'outil Sol, choisis dans la barre d'options. */
export type ShapeSettings = {
  kind: ShapeKind;
  erase: boolean;
  /** Rectangle : rayon des coins ; forme libre : 1 = contour arrondi */
  round: number;
  sides: number;
  width: number;
  curve: boolean;
  wear: number;
  layer: MapLayer;
  /** Alignement : 1 = sur la grille, 0.5 = demi-case, 0 = libre */
  snap: number;
};
export const DEFAULT_SHAPE_SETTINGS: ShapeSettings = {
  kind: "rect",
  erase: false,
  round: 0,
  sides: 0,
  width: 1,
  curve: false,
  wear: 0,
  snap: 1,
  layer: "floor",
};

/** Forme tracée avec les réglages du moment. */
export function draftShape(o: ShapeSettings, pts: Point[]): MapShape {
  const s: MapShape = { t: o.kind, pts };
  if (o.erase) s.erase = true;
  if (o.kind === "rect" && o.round > 0) s.round = o.round;
  if (o.kind === "poly" && o.round > 0) s.round = 1;
  if (o.kind === "ellipse" && o.sides >= 3) s.sides = o.sides;
  if (o.kind === "path") s.width = o.width;
  if (o.kind === "path" && o.curve) s.curve = true;
  if (o.wear > 0) s.wear = o.wear;
  if (o.layer !== "floor") s.layer = o.layer;
  return s;
}
