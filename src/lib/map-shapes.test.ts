import { describe, expect, it } from "vitest";
import { sees, sightFrom, type MapEdge, type VisionRule } from "./map";
import {
  DEFAULT_SHAPE_SETTINGS,
  cutByDoors,
  draftShape,
  floorOf,
  floorSegments,
  pathOffset,
  readShapes,
  shapeArea,
  shapePolygons,
  shapesToJson,
  snapPoint,
  type MapShape,
} from "./map-shapes";

const rect = (x1: number, y1: number, x2: number, y2: number, erase = false): MapShape => ({
  t: "rect",
  pts: [
    { x: x1, y: y1 },
    { x: x2, y: y2 },
  ],
  ...(erase ? { erase: true as const } : {}),
});
const areaOf = (floor: ReturnType<typeof floorOf>) =>
  floor.reduce(
    (sum, poly) =>
      sum +
      poly.reduce((acc, ring, i) => {
        let a = 0;
        for (let k = 0; k < ring.length - 1; k++)
          a += ring[k]![0] * ring[k + 1]![1] - ring[k + 1]![0] * ring[k]![1];
        return acc + (i === 0 ? 1 : -1) * Math.abs(a / 2);
      }, 0),
    0,
  );

describe("sols dessinés par formes", () => {
  it("lit la colonne en ignorant le reste", () => {
    const shapes = readShapes([
      {
        t: "rect",
        pts: [
          [0, 0],
          [3.333, 2],
        ],
      },
      { t: "pirate", pts: [[0, 0]] },
      {
        t: "poly",
        pts: [
          [0, 0],
          [1, 1],
        ],
      },
      {
        t: "ellipse",
        pts: [
          [5, 5],
          [7, 5],
        ],
        sides: 2,
        wear: 9,
      },
      "n'importe quoi",
    ]);
    expect(shapes).toEqual([
      {
        t: "rect",
        pts: [
          { x: 0, y: 0 },
          { x: 3.33, y: 2 },
        ],
      },
      {
        t: "ellipse",
        pts: [
          { x: 5, y: 5 },
          { x: 7, y: 5 },
        ],
        wear: 3,
      },
    ]);
    expect(readShapes(null)).toEqual([]);
  });

  it("enregistre les points en [x, y] et les relit à l'identique", () => {
    const shapes = [rect(1, 1, 4, 3), { ...rect(2, 2, 3, 3, true), wear: 1 }];
    const stored = JSON.parse(JSON.stringify(shapesToJson(shapes)));
    expect(stored[0].pts).toEqual([
      [1, 1],
      [4, 3],
    ]);
    expect(readShapes(stored)).toEqual(shapes);
  });

  it("deux salles qui se touchent deviennent une seule pièce", () => {
    const floor = floorOf([rect(0, 0, 4, 4), rect(4, 1, 8, 3)], 20, 20);
    expect(floor).toHaveLength(1);
    expect(areaOf(floor)).toBeCloseTo(16 + 8);
  });

  it("creuser fait un pilier, et l'ordre compte", () => {
    const pillar = floorOf([rect(0, 0, 6, 6), rect(2, 2, 4, 4, true)], 20, 20);
    expect(pillar[0]).toHaveLength(2);
    expect(areaOf(pillar)).toBeCloseTo(32);
    const refilled = floorOf([rect(0, 0, 6, 6), rect(2, 2, 4, 4, true), rect(2, 2, 4, 4)], 20, 20);
    expect(areaOf(refilled)).toBeCloseTo(36);
  });

  it("le sol s'arrête au bord de la carte", () => {
    expect(areaOf(floorOf([rect(8, 8, 14, 14)], 10, 10))).toBeCloseTo(4);
  });

  it("un couloir d'une case suit le centre des cases", () => {
    expect(pathOffset(1, 1)).toBe(0.5);
    expect(pathOffset(2, 1)).toBe(0);
    expect(pathOffset(1, 0.5)).toBe(0);
    const corridor: MapShape = {
      t: "path",
      width: 1,
      pts: [
        { x: 0.5, y: 0.5 },
        { x: 4.5, y: 0.5 },
        { x: 4.5, y: 3.5 },
      ],
    };
    // Cinq cases à l'horizontale, puis trois de plus vers le bas : angle net, sans débord
    expect(areaOf(floorOf([corridor], 20, 20))).toBeCloseTo(8);
  });

  it("cercle et polygone régulier", () => {
    const circle = draftShape({ ...DEFAULT_SHAPE_SETTINGS, kind: "ellipse" }, [
      { x: 5, y: 5 },
      { x: 7, y: 5 },
    ]);
    expect(shapeArea(circle)).toBeGreaterThan(12);
    expect(shapeArea(circle)).toBeLessThan(Math.PI * 4);
    const hexagon = draftShape({ ...DEFAULT_SHAPE_SETTINGS, kind: "ellipse", sides: 6 }, [
      { x: 5, y: 5 },
      { x: 7, y: 5 },
    ]);
    expect(shapePolygons(hexagon)[0]![0]).toHaveLength(6);
  });

  it("un simple clic ne fait pas de forme", () => {
    expect(shapeArea(rect(2, 2, 2, 2))).toBe(0);
  });

  it("l'usure est la même sur chaque écran", () => {
    const worn = { ...rect(0, 0, 4, 4), wear: 2 };
    expect(shapePolygons(worn)).toEqual(shapePolygons({ ...worn }));
    expect(shapePolygons(worn)[0]![0]!.length).toBeGreaterThan(4);
  });

  it("aimant : case, demi-case ou libre, sans sortir de la carte", () => {
    const p = { x: 2.3, y: 7.8 };
    expect(snapPoint(p, 1, 10, 10)).toEqual({ x: 2, y: 8 });
    expect(snapPoint(p, 0.5, 10, 10)).toEqual({ x: 2.5, y: 8 });
    expect(snapPoint(p, 0, 10, 10)).toEqual(p);
    expect(snapPoint({ x: 12, y: -1 }, 1, 10, 10)).toEqual({ x: 10, y: 0 });
  });
});

describe("murs des sols et vision", () => {
  const room = floorOf([rect(0, 0, 3, 3)], 10, 10);
  const door = (open: boolean): MapEdge => ({
    x: 3,
    y: 1,
    dir: "v",
    kind: "door",
    ...(open ? { open: true } : {}),
  });
  const roomRule: VisionRule = { mode: "room", range: 0, corners: false };
  const sightRule: VisionRule = { mode: "sight", range: 0, corners: false };

  it("une porte ouverte perce le mur, une porte fermée non", () => {
    const segs = floorSegments(room);
    const closed = cutByDoors(segs, [door(false)]);
    expect(closed.segments).toHaveLength(segs.length);
    expect(closed.onWall.has("v:3:1")).toBe(true);
    const open = cutByDoors(segs, [door(true)]);
    expect(open.segments).toHaveLength(segs.length + 1);
  });

  it("la pièce fermée retient la vue du groupe", () => {
    const walls = floorSegments(room);
    const inRoom = sightFrom({ x: 1.5, y: 1.5 }, [], roomRule, 10, 10, walls);
    expect(inRoom.cells?.size).toBe(9);
    const look = sightFrom({ x: 1.5, y: 1.5 }, [], sightRule, 10, 10, walls);
    expect(sees(look, { x: 2.5, y: 2.5 }, 10, 10)).toBe(true);
    expect(sees(look, { x: 6.5, y: 1.5 }, 10, 10)).toBe(false);
  });

  it("par la porte ouverte, la vue passe", () => {
    const edges = [door(true)];
    const walls = cutByDoors(floorSegments(room), edges).segments;
    const flood = sightFrom({ x: 1.5, y: 1.5 }, edges, roomRule, 10, 10, walls);
    expect(flood.cells?.size).toBeGreaterThan(9);
    const look = sightFrom({ x: 1.5, y: 1.5 }, edges, sightRule, 10, 10, walls);
    expect(sees(look, { x: 6.5, y: 1.5 }, 10, 10)).toBe(true);
  });
});
