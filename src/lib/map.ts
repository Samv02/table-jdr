/**
 * Cartes 2D : calculs de la grille, sans affichage ni base.
 * Murs et portes vivent sur les arêtes des cases, les trappes au sol d'une case ;
 * les pions sont libres, en fractions de case.
 */
export const MAP_MIN = 4;
export const MAP_MAX = 100;
export const MAP_EDGES_MAX = 5000;

export type EdgeDir = "h" | "v" | "c";
export type EdgeKind = "wall" | "door";
export type DoorType = "simple" | "double" | "secret" | "bars" | "trap";
export const DOOR_TYPES: { id: DoorType; label: string; hint: string }[] = [
  { id: "simple", label: "Porte", hint: "Bloque la vue tant qu’elle est fermée." },
  { id: "double", label: "Double", hint: "Deux battants, bloque la vue tant qu’elle est fermée." },
  { id: "secret", label: "Secrète", hint: "Les joueurs voient un mur tant qu’elle est fermée." },
  { id: "bars", label: "Grille", hint: "Laisse passer la vue, même fermée." },
  { id: "trap", label: "Trappe", hint: "Se pose au sol d’une case, ne bloque pas la vue." },
];
/**
 * Arête partant du coin (x, y), vers la droite (h) ou vers le bas (v) ; c : le sol de la case (x, y).
 * Une porte sans `door` est une porte simple.
 */
export type MapEdge = {
  x: number;
  y: number;
  dir: EdgeDir;
  kind: EdgeKind;
  open?: boolean;
  door?: Exclude<DoorType, "simple">;
};
export type Point = { x: number; y: number };

export const edgeKey = (e: Pick<MapEdge, "x" | "y" | "dir">) => `${e.dir}:${e.x}:${e.y}`;

export const insideMap = (e: Pick<MapEdge, "x" | "y" | "dir">, w: number, h: number) =>
  e.x >= 0 && e.y >= 0 && e.x <= (e.dir === "v" ? w : w - 1) && e.y <= (e.dir === "h" ? h : h - 1);

const readDoor = (raw: unknown) =>
  raw === "double" || raw === "secret" || raw === "bars" || raw === "trap" ? raw : undefined;

/** Lit la colonne `walls` ; une ligne illisible est ignorée, jamais une erreur d'affichage. */
export function readEdges(raw: unknown): MapEdge[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Map<string, MapEdge>();
  for (const item of raw) {
    const o = (item ?? {}) as Record<string, unknown>;
    const { x, y } = o;
    if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
    if (o["dir"] !== "h" && o["dir"] !== "v" && o["dir"] !== "c") continue;
    const door = o["kind"] === "door" ? readDoor(o["door"]) : undefined;
    // Le sol d'une case ne porte qu'une trappe, et une trappe n'est jamais sur une arête
    if ((o["dir"] === "c") !== (door === "trap")) continue;
    const edge: MapEdge = {
      x: x as number,
      y: y as number,
      dir: o["dir"],
      kind: o["kind"] === "door" ? "door" : "wall",
      ...(door ? { door } : {}),
      ...(o["kind"] === "door" && o["open"] === true ? { open: true } : {}),
    };
    seen.set(edgeKey(edge), edge);
  }
  return [...seen.values()];
}

export const clampSize = (n: number) =>
  Number.isFinite(n) ? Math.min(MAP_MAX, Math.max(MAP_MIN, Math.round(n))) : MAP_MIN;

export const clampToken = (p: Point, w: number, h: number): Point => ({
  x: Math.min(w, Math.max(0, p.x)),
  y: Math.min(h, Math.max(0, p.y)),
});

/** Coin de grille le plus proche d'un point. */
export const nearestCorner = (p: Point, w: number, h: number): Point => ({
  x: Math.min(w, Math.max(0, Math.round(p.x))),
  y: Math.min(h, Math.max(0, Math.round(p.y))),
});

/** Arête la plus proche d'un point : celle de la case visée dont le bord est le plus près. */
export function nearestEdge(p: Point, w: number, h: number): Pick<MapEdge, "x" | "y" | "dir"> {
  const cx = Math.min(w - 1, Math.max(0, Math.floor(p.x)));
  const cy = Math.min(h - 1, Math.max(0, Math.floor(p.y)));
  const top = p.y - cy;
  const bottom = cy + 1 - p.y;
  const left = p.x - cx;
  const right = cx + 1 - p.x;
  const min = Math.min(top, bottom, left, right);
  if (min === top) return { x: cx, y: cy, dir: "h" };
  if (min === bottom) return { x: cx, y: cy + 1, dir: "h" };
  if (min === left) return { x: cx, y: cy, dir: "v" };
  return { x: cx + 1, y: cy, dir: "v" };
}

/** Sol de la case sous un point : c'est là que se pose une trappe. */
export const cellAt = (p: Point, w: number, h: number): Pick<MapEdge, "x" | "y" | "dir"> => ({
  x: Math.min(w - 1, Math.max(0, Math.floor(p.x))),
  y: Math.min(h - 1, Math.max(0, Math.floor(p.y))),
  dir: "c",
});

/** Ce que vise la gomme : la trappe si le pointeur est dessus, sinon l'arête la plus proche. */
export function eraseTarget(edges: MapEdge[], p: Point, w: number, h: number) {
  const cell = cellAt(p, w, h);
  const onTrap =
    distance(p, { x: cell.x + 0.5, y: cell.y + 0.5 }) < 0.35 &&
    edges.some((e) => edgeKey(e) === edgeKey(cell));
  return onTrap ? cell : nearestEdge(p, w, h);
}

/** Arêtes reliant deux coins en suivant la grille : d'abord à l'horizontale, puis à la verticale. */
export function edgesBetween(a: Point, b: Point): Pick<MapEdge, "x" | "y" | "dir">[] {
  const out: Pick<MapEdge, "x" | "y" | "dir">[] = [];
  for (let x = Math.min(a.x, b.x); x < Math.max(a.x, b.x); x++) out.push({ x, y: a.y, dir: "h" });
  for (let y = Math.min(a.y, b.y); y < Math.max(a.y, b.y); y++) out.push({ x: b.x, y, dir: "v" });
  return out;
}

/** Une arête ne porte qu'un élément : le nouveau remplace l'ancien. */
export function setEdge(edges: MapEdge[], edge: MapEdge) {
  const key = edgeKey(edge);
  const rest = edges.filter((e) => edgeKey(e) !== key);
  return rest.length >= MAP_EDGES_MAX ? edges : [...rest, edge];
}
export const removeEdge = (edges: MapEdge[], key: string) =>
  edges.filter((e) => edgeKey(e) !== key);

export function toggleDoor(edges: MapEdge[], key: string): MapEdge[] {
  return edges.map((e) => {
    if (edgeKey(e) !== key || e.kind !== "door") return e;
    const { open, ...closed } = e;
    return open ? closed : { ...closed, open: true };
  });
}

/** « Ennemi 3 » : premier numéro libre, pour que deux pions ne portent jamais le même nom. */
export function nextLabel(base: string, labels: string[]) {
  let n = 1;
  while (labels.includes(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

export const initials = (label: string) => label.trim().slice(0, 2).toUpperCase();

/** Contour d'une pièce entre deux coins opposés. */
export function roomEdges(a: Point, b: Point): Pick<MapEdge, "x" | "y" | "dir">[] {
  const left = Math.min(a.x, b.x);
  const right = Math.max(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const bottom = Math.max(a.y, b.y);
  return [
    ...edgesBetween({ x: left, y: top }, { x: right, y: top }),
    ...edgesBetween({ x: left, y: bottom }, { x: right, y: bottom }),
    ...edgesBetween({ x: left, y: top }, { x: left, y: bottom }),
    ...edgesBetween({ x: right, y: top }, { x: right, y: bottom }),
  ];
}

export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** « 7,5 m » : l'échelle et son unité viennent de la carte, jamais du code. */
export function formatDistance(cells: number, value: number, unit: string) {
  const n = (cells * value).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  return `${n} ${unit}`;
}

/** Centre de la case sous un point : Maj pendant un déplacement cale le pion. */
export const snapToCell = (p: Point, w: number, h: number): Point => ({
  x: Math.min(w - 0.5, Math.max(0.5, Math.floor(p.x) + 0.5)),
  y: Math.min(h - 0.5, Math.max(0.5, Math.floor(p.y) + 0.5)),
});

export type Segment = { a: Point; b: Point };

/**
 * Ce qui bloque la vue : murs et portes fermées, arêtes voisines fusionnées pour aller vite.
 * Une grille laisse voir à travers, une trappe est au sol.
 */
export function blockers(edges: MapEdge[]): Segment[] {
  const lines = new Map<string, number[]>();
  for (const e of edges) {
    if (e.open || e.dir === "c" || e.door === "bars") continue;
    const key = e.dir === "h" ? `h${e.y}` : `v${e.x}`;
    lines.set(key, [...(lines.get(key) ?? []), e.dir === "h" ? e.x : e.y]);
  }
  const out: Segment[] = [];
  for (const [key, cells] of lines) {
    const line = Number(key.slice(1));
    const at = (n: number): Point => (key[0] === "h" ? { x: n, y: line } : { x: line, y: n });
    const sorted = [...cells].sort((a, b) => a - b);
    let start = sorted[0]!;
    let end = start + 1;
    for (const n of sorted.slice(1)) {
      if (n === end) end = n + 1;
      else {
        out.push({ a: at(start), b: at(end) });
        start = n;
        end = n + 1;
      }
    }
    out.push({ a: at(start), b: at(end) });
  }
  return out;
}

/** Distance le long d'un rayon jusqu'à un segment, null s'il ne le touche pas. */
function hit(o: Point, dx: number, dy: number, s: Segment) {
  const sx = s.b.x - s.a.x;
  const sy = s.b.y - s.a.y;
  const det = dx * sy - dy * sx;
  if (Math.abs(det) < 1e-9) return null;
  const t = ((s.a.x - o.x) * sy - (s.a.y - o.y) * sx) / det;
  const u = ((s.a.x - o.x) * dy - (s.a.y - o.y) * dx) / det;
  return t > 1e-6 && u >= 0 && u <= 1 ? t : null;
}

/** Zone visible depuis un point : un rayon vers chaque extrémité, arrêté par le premier obstacle. */
export function visibility(o: Point, segments: Segment[], w: number, h: number): Point[] {
  const corners = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  const all: Segment[] = [...segments, ...corners.map((a, i) => ({ a, b: corners[(i + 1) % 4]! }))];
  const seen = new Set<string>();
  const angles: number[] = [];
  for (const s of all)
    for (const p of [s.a, s.b]) {
      const key = `${p.x}:${p.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const a = Math.atan2(p.y - o.y, p.x - o.x);
      angles.push(a - 1e-4, a, a + 1e-4);
    }
  return angles
    .sort((a, b) => a - b)
    .flatMap((a) => {
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      let best: number | null = null;
      for (const s of all) {
        const t = hit(o, dx, dy, s);
        if (t !== null && (best === null || t < best)) best = t;
      }
      return best === null ? [] : [{ x: o.x + dx * best, y: o.y + dy * best }];
    });
}

export function inPolygon(p: Point, poly: Point[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}

export type Camera = { x: number; y: number; k: number };
export const ZOOM_MIN = 0.15;
export const ZOOM_MAX = 5;

/** Zoom centré sur un point de l'écran : ce qui est sous le pointeur ne bouge pas. */
export function zoomAt(c: Camera, sx: number, sy: number, factor: number): Camera {
  const k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, c.k * factor));
  const r = k / c.k;
  return { k, x: sx - (sx - c.x) * r, y: sy - (sy - c.y) * r };
}

/** Cadre tout le contenu dans la vue, centré. */
export function fitCamera(cw: number, ch: number, vw: number, vh: number, pad = 40): Camera {
  const k = Math.min(
    ZOOM_MAX,
    Math.max(ZOOM_MIN, Math.min((vw - pad * 2) / cw, (vh - pad * 2) / ch)),
  );
  return { k, x: (vw - cw * k) / 2, y: (vh - ch * k) / 2 };
}
