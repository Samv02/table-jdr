/**
 * Zone de la carte : copier, couper, coller ou vider un rectangle de cases entières.
 * Une zone copiée garde ses sols (chaque matière), ses murs, ses portes et ses objets.
 */
import polygonClipping from "polygon-clipping";
import { MAP_EDGES_MAX, edgeKey, type MapEdge, type Point } from "@/lib/map";
import { OBJECTS_MAX, newObjectId, type MapObject } from "@/lib/map-objects";
import { SHAPES_MAX, floorOf, type MapShape } from "@/lib/map-shapes";
import { MAP_LAYERS } from "@/lib/map-style";

export type Zone = { x0: number; y0: number; x1: number; y1: number };
export type Clip = {
  w: number;
  h: number;
  shapes: MapShape[];
  edges: MapEdge[];
  objects: MapObject[];
};
type Content = { shapes: MapShape[]; edges: MapEdge[]; objects: MapObject[] };

/** Rectangle de cases entières entre deux points, dans la carte ; null s'il est vide. */
export function zoneFrom(a: Point, b: Point, w: number, h: number): Zone | null {
  const fit = (v: number, max: number) => Math.min(max, Math.max(0, v));
  const zone = {
    x0: fit(Math.floor(Math.min(a.x, b.x)), w),
    y0: fit(Math.floor(Math.min(a.y, b.y)), h),
    x1: fit(Math.ceil(Math.max(a.x, b.x)), w),
    y1: fit(Math.ceil(Math.max(a.y, b.y)), h),
  };
  return zone.x1 > zone.x0 && zone.y1 > zone.y0 ? zone : null;
}

/** Une arête (ou une trappe) entièrement dans la zone. */
function edgeIn(e: MapEdge, z: Zone) {
  const x1 = e.x + (e.dir === "v" ? 0 : 1);
  const y1 = e.y + (e.dir === "h" ? 0 : 1);
  return e.x >= z.x0 && e.y >= z.y0 && x1 <= z.x1 && y1 <= z.y1;
}
const objectIn = (o: MapObject, z: Zone) => o.x >= z.x0 && o.x < z.x1 && o.y >= z.y0 && o.y < z.y1;

const ring = (z: Zone): [number, number][] => [
  [z.x0, z.y0],
  [z.x1, z.y0],
  [z.x1, z.y1],
  [z.x0, z.y1],
];
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Copie : chaque contour de sol devient une forme libre, chaque trou une forme qui creuse. */
export function copyZone(z: Zone, c: Content, w: number, h: number): Clip {
  const shapes: MapShape[] = [];
  for (const { id: layer } of MAP_LAYERS) {
    const floor = floorOf(c.shapes, w, h, layer);
    if (!floor.length) continue;
    let cut: ReturnType<typeof polygonClipping.intersection> = [];
    try {
      cut = polygonClipping.intersection(floor, [ring(z)]);
    } catch {
      continue;
    }
    const extra = layer === "floor" ? {} : { layer };
    const toShape = (r: [number, number][], erase: boolean): MapShape => ({
      t: "poly",
      // polygon-clipping referme ses contours : le dernier point répète le premier
      pts: r.slice(0, -1).map(([x, y]) => ({ x: round2(x - z.x0), y: round2(y - z.y0) })),
      ...extra,
      ...(erase ? { erase: true as const } : {}),
    });
    for (const poly of cut) shapes.push(toShape(poly[0]!, false));
    for (const poly of cut) for (const hole of poly.slice(1)) shapes.push(toShape(hole, true));
  }
  return {
    w: z.x1 - z.x0,
    h: z.y1 - z.y0,
    shapes: shapes.filter((s) => s.pts.length >= 3),
    edges: c.edges.filter((e) => edgeIn(e, z)).map((e) => ({ ...e, x: e.x - z.x0, y: e.y - z.y0 })),
    objects: c.objects
      .filter((o) => objectIn(o, z))
      .map((o) => ({ ...o, x: round2(o.x - z.x0), y: round2(o.y - z.y0) })),
  };
}

/** Colle la copie, son coin haut-gauche sur la case visée ; ce qui sort de la carte est laissé. */
export function pasteClip(clip: Clip, at: Point, c: Content, w: number, h: number): Content {
  const dx = Math.min(Math.max(0, Math.floor(at.x)), Math.max(0, w - 1));
  const dy = Math.min(Math.max(0, Math.floor(at.y)), Math.max(0, h - 1));
  const shapes = [
    ...c.shapes,
    ...clip.shapes.map((s) => ({ ...s, pts: s.pts.map((p) => ({ x: p.x + dx, y: p.y + dy })) })),
  ].slice(0, SHAPES_MAX);
  const edges = new Map(c.edges.map((e) => [edgeKey(e), e]));
  const area = { x0: 0, y0: 0, x1: w, y1: h };
  for (const e of clip.edges) {
    const moved = { ...e, x: e.x + dx, y: e.y + dy };
    if (edgeIn(moved, area) && edges.size < MAP_EDGES_MAX) edges.set(edgeKey(moved), moved);
  }
  const objects = [...c.objects];
  for (const o of clip.objects) {
    if (objects.length >= OBJECTS_MAX) break;
    const moved = { ...o, id: newObjectId(objects), x: o.x + dx, y: o.y + dy };
    if (moved.x <= w && moved.y <= h) objects.push(moved);
  }
  return { shapes, edges: [...edges.values()], objects };
}

/** Vide la zone : chaque matière présente y est creusée, murs et objets retirés. */
export function clearZone(z: Zone, c: Content, w: number, h: number): Content {
  const pts = [
    { x: z.x0, y: z.y0 },
    { x: z.x1, y: z.y1 },
  ];
  const erase: MapShape[] = [];
  for (const { id: layer } of MAP_LAYERS)
    if (floorOf(c.shapes, w, h, layer).length)
      erase.push({ t: "rect", pts, erase: true, ...(layer === "floor" ? {} : { layer }) });
  return {
    shapes: [...c.shapes, ...erase].slice(0, SHAPES_MAX),
    edges: c.edges.filter((e) => !edgeIn(e, z)),
    objects: c.objects.filter((o) => !objectIn(o, z)),
  };
}
