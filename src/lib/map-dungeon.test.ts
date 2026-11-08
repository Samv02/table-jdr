import { describe, expect, it } from "vitest";
import { floorOf } from "./map-shapes";
import { inPolygon } from "./map";
import { readObjects } from "./map-objects";
import {
  DEFAULT_DUNGEON,
  DUNGEON_SIZES,
  generateDungeon,
  random,
  type DungeonOptions,
} from "./map-dungeon";

/** Toutes les pièces sont-elles reliées entre elles ? */
function connected(rooms: number, links: [number, number][]) {
  const parent = Array.from({ length: rooms }, (_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i]!)));
  for (const [a, b] of links) parent[root(a)] = root(b);
  return new Set(parent.map((_, i) => root(i))).size === 1;
}

const layouts: DungeonOptions["layout"][] = ["line", "branch", "balanced", "winding"];

describe("donjon aléatoire", () => {
  it("le même tirage redonne le même donjon", () => {
    expect(generateDungeon(DEFAULT_DUNGEON, 42)).toEqual(generateDungeon(DEFAULT_DUNGEON, 42));
    expect(generateDungeon(DEFAULT_DUNGEON, 42)).not.toEqual(generateDungeon(DEFAULT_DUNGEON, 43));
    expect(random(1)()).toBe(random(1)());
  });

  it("chaque disposition donne des pièces toutes reliées, sans chevauchement, dans la carte", () => {
    for (const layout of layouts)
      for (const seed of [1, 7, 99, 2024]) {
        const d = generateDungeon({ ...DEFAULT_DUNGEON, layout, rooms: 9 }, seed);
        expect(d.rooms.length).toBeGreaterThan(2);
        expect(connected(d.rooms.length, d.links)).toBe(true);
        for (const r of d.rooms) {
          expect(r.x).toBeGreaterThanOrEqual(1);
          expect(r.y).toBeGreaterThanOrEqual(1);
          expect(r.x + r.w).toBeLessThanOrEqual(d.width - 1);
          expect(r.y + r.h).toBeLessThanOrEqual(d.height - 1);
        }
        // Pièces et couloirs se fondent en un seul sol d'un seul tenant
        expect(floorOf(d.shapes, d.width, d.height)).toHaveLength(1);
      }
  });

  it("en ligne, chaque pièce part de la précédente (tant qu'elle a de la place)", () => {
    const d = generateDungeon({ ...DEFAULT_DUNGEON, layout: "line", size: "l", rooms: 5 }, 3);
    expect(d.links.filter(([a, b]) => b === a + 1).length).toBeGreaterThanOrEqual(3);
  });

  it("la taille choisie fixe celle de la carte", () => {
    const d = generateDungeon({ ...DEFAULT_DUNGEON, size: "s" }, 5);
    expect({ w: d.width, h: d.height }).toEqual(DUNGEON_SIZES.s);
  });

  it("portes : aucune si demandé, sur les couloirs étroits seulement", () => {
    expect(generateDungeon({ ...DEFAULT_DUNGEON, doors: 0 }, 8).edges).toEqual([]);
    expect(generateDungeon({ ...DEFAULT_DUNGEON, doors: 1 }, 8).edges.length).toBeGreaterThan(0);
    expect(generateDungeon({ ...DEFAULT_DUNGEON, doors: 1, corridorWidth: 2 }, 8).edges).toEqual(
      [],
    );
    for (const e of generateDungeon({ ...DEFAULT_DUNGEON, doors: 1 }, 8).edges)
      expect(e.kind).toBe("door");
  });

  it("une porte ferme toujours un passage : murs des deux côtés, jamais contournable", () => {
    const opts = { ...DEFAULT_DUNGEON, doors: 1, rooms: 12, size: "l" as const };
    let seen = 0;
    for (const layout of layouts)
      for (let seed = 1; seed <= 40; seed++) {
        const d = generateDungeon({ ...opts, layout }, seed);
        const floor = floorOf(d.shapes, d.width, d.height);
        const ring = (r: [number, number][]) => r.map(([x, y]) => ({ x, y }));
        const isFloor = (x: number, y: number) =>
          floor.some(
            ([outer, ...holes]) =>
              !!outer &&
              inPolygon({ x: x + 0.5, y: y + 0.5 }, ring(outer)) &&
              !holes.some((h) => inPolygon({ x: x + 0.5, y: y + 0.5 }, ring(h))),
          );
        for (const e of d.edges) {
          seen++;
          // Les deux bouts de la porte touchent un mur, des deux côtés de l'arête
          const ends =
            e.dir === "v"
              ? [
                  [e.x - 1, e.y - 1],
                  [e.x, e.y - 1],
                  [e.x - 1, e.y + 1],
                  [e.x, e.y + 1],
                ]
              : [
                  [e.x - 1, e.y - 1],
                  [e.x - 1, e.y],
                  [e.x + 1, e.y - 1],
                  [e.x + 1, e.y],
                ];
          const open = ends.filter(([x, y]) => isFloor(x!, y!)).length;
          // Côté pièce, le sol continue ; côté couloir, jamais
          expect(open).toBeLessThanOrEqual(2);
        }
      }
    expect(seen).toBeGreaterThan(20);
  });

  it("formes et usure demandées, numéros lisibles comme des textes", () => {
    const d = generateDungeon(
      {
        ...DEFAULT_DUNGEON,
        rooms: 10,
        shapes: { square: false, irregular: true, round: true },
        wear: 2,
      },
      11,
    );
    expect(d.shapes.every((s) => s.wear === 2)).toBe(true);
    expect(d.shapes.some((s) => s.t === "poly" || s.t === "ellipse" || s.round)).toBe(true);
    const numbers = readObjects(d.objects);
    expect(numbers.map((o) => o.text)).toEqual(d.rooms.map((_, i) => String(i + 1)));
    expect(generateDungeon({ ...DEFAULT_DUNGEON, numbers: false }, 11).objects).toEqual([]);
  });
});
