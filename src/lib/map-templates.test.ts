import { describe, expect, it } from "vitest";
import { inPolygon, type MapEdge } from "./map";
import { floorOf } from "./map-shapes";
import { readObjects } from "./map-objects";
import { MAP_TEMPLATES, TEMPLATE_SIZES, buildTemplate, type MapDraft } from "./map-templates";

/** Cases dont le centre est dans le sol. */
function floorCells(d: MapDraft) {
  const floor = floorOf(d.shapes, d.width, d.height);
  const ring = (r: [number, number][]) => r.map(([x, y]) => ({ x, y }));
  const cells = new Set<string>();
  for (let y = 0; y < d.height; y++)
    for (let x = 0; x < d.width; x++) {
      const p = { x: x + 0.5, y: y + 0.5 };
      if (
        floor.some(
          ([outer, ...holes]) =>
            !!outer && inPolygon(p, ring(outer)) && !holes.some((h) => inPolygon(p, ring(h))),
        )
      )
        cells.add(`${x}:${y}`);
    }
  return cells;
}

/** Toutes les cases de sol se rejoignent-elles à pied, portes comprises ? */
function walkable(d: MapDraft, cells: Set<string>) {
  const walls = new Set(
    d.edges.filter((e) => e.kind === "wall").map((e: MapEdge) => `${e.dir}:${e.x}:${e.y}`),
  );
  const first = [...cells][0];
  if (!first) return true;
  const seen = new Set([first]);
  const todo = [first];
  while (todo.length) {
    const [x, y] = todo.pop()!.split(":").map(Number) as [number, number];
    const steps: [number, number, string][] = [
      [x + 1, y, `v:${x + 1}:${y}`],
      [x - 1, y, `v:${x}:${y}`],
      [x, y + 1, `h:${x}:${y + 1}`],
      [x, y - 1, `h:${x}:${y}`],
    ];
    for (const [nx, ny, edge] of steps) {
      const k = `${nx}:${ny}`;
      if (!cells.has(k) || seen.has(k) || walls.has(edge)) continue;
      seen.add(k);
      todo.push(k);
    }
  }
  return seen.size === cells.size;
}

describe("modèles de carte", () => {
  it("chaque modèle, à chaque taille, reste dans la carte et se parcourt en entier", () => {
    for (const t of MAP_TEMPLATES)
      for (const z of TEMPLATE_SIZES)
        for (const seed of [1, 2, 3]) {
          const d = buildTemplate(t.id, z.id, seed);
          expect(d.width).toBeGreaterThanOrEqual(4);
          expect(d.height).toBeGreaterThanOrEqual(4);
          const cells = floorCells(d);
          if (t.id === "empty") {
            expect(cells.size).toBe(0);
            continue;
          }
          expect(cells.size, `${t.id} ${z.id}`).toBeGreaterThan(20);
          expect(floorOf(d.shapes, d.width, d.height), `${t.id} ${z.id}`).toHaveLength(1);
          expect(walkable(d, cells), `${t.id} ${z.id} ${seed}`).toBe(true);
          for (const e of d.edges) {
            expect(e.x).toBeGreaterThanOrEqual(0);
            expect(e.y).toBeGreaterThanOrEqual(0);
            expect(e.x).toBeLessThanOrEqual(d.width);
            expect(e.y).toBeLessThanOrEqual(d.height);
          }
        }
  });

  it("une porte relie toujours deux cases de sol", () => {
    for (const t of MAP_TEMPLATES)
      for (const z of TEMPLATE_SIZES) {
        const d = buildTemplate(t.id, z.id, 5);
        const cells = floorCells(d);
        for (const e of d.edges.filter((x) => x.kind === "door")) {
          const a = e.dir === "v" ? `${e.x - 1}:${e.y}` : `${e.x}:${e.y - 1}`;
          const b = `${e.x}:${e.y}`;
          expect(cells.has(a) && cells.has(b), `${t.id} ${z.id} ${e.dir}:${e.x}:${e.y}`).toBe(true);
        }
      }
  });

  it("les maisons et bâtiments ont des pièces nommées, lisibles comme des textes", () => {
    for (const id of ["house", "building"] as const) {
      const d = buildTemplate(id, "m");
      expect(d.edges.some((e) => e.kind === "door")).toBe(true);
      expect(readObjects(d.objects).length).toBe(d.objects.length);
    }
  });

  it("un modèle tiré au hasard change d'un tirage à l'autre, les autres jamais", () => {
    expect(buildTemplate("cave", "m", 1)).not.toEqual(buildTemplate("cave", "m", 2));
    expect(buildTemplate("house", "m", 1)).toEqual(buildTemplate("house", "m", 2));
  });
});
