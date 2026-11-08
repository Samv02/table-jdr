import { describe, expect, it } from "vitest";
import { floorOf, type MapShape } from "./map-shapes";
import { readObjects } from "./map-objects";
import {
  hiddenShapes,
  levelLabel,
  neighborFloor,
  nextPosition,
  partySpots,
  swapLayer,
  visibleShapes,
  type LayerView,
} from "./map-layers";

const rect = (x1: number, y1: number, x2: number, y2: number, erase = false): MapShape => ({
  t: "rect",
  pts: [
    { x: x1, y: y1 },
    { x: x2, y: y2 },
  ],
  ...(erase ? { erase: true as const } : {}),
});
const view = (id: string | null, shapes: MapShape[], hidden = false): LayerView => ({
  id,
  name: id ?? "principal",
  hidden,
  locked: false,
  shapes,
  objects: [],
});

describe("calques", () => {
  it("les calques visibles s'empilent : un calque du dessus peut creuser celui du dessous", () => {
    const views = [view(null, [rect(0, 0, 6, 6)]), view("piliers", [rect(2, 2, 4, 4, true)])];
    expect(floorOf(visibleShapes(views), 10, 10)[0]).toHaveLength(2);
  });

  it("un calque caché ne compte pas pour les murs, le MJ le voit à part", () => {
    const secret = rect(6, 0, 9, 3);
    const views = [view(null, [rect(0, 0, 6, 6)]), view("secret", [secret], true)];
    expect(visibleShapes(views)).toHaveLength(1);
    expect(hiddenShapes(views)).toEqual([secret]);
  });

  it("nouveau calque en haut, échange avec son voisin", () => {
    const rows = [
      { id: "a", position: 0 },
      { id: "b", position: 1 },
    ];
    expect(nextPosition(rows)).toBe(2);
    expect(nextPosition([])).toBe(0);
    expect(swapLayer(rows, "a", 1)).toEqual([
      { id: "a", position: 1 },
      { id: "b", position: 0 },
    ]);
    expect(swapLayer(rows, "b", 1)).toBeNull();
    // Positions égales : on les départage quand même
    const tied = swapLayer(
      [
        { id: "a", position: 0 },
        { id: "b", position: 0 },
      ],
      "a",
      1,
    );
    expect(tied?.[0].position).not.toBe(tied?.[1].position);
  });
});

describe("étages", () => {
  const maps = [
    { id: "rdc", place: "Tour", level: 0 },
    { id: "haut", place: " tour ", level: 3 },
    { id: "cave", place: "Tour", level: -1 },
    { id: "ailleurs", place: "Auberge", level: 1 },
    { id: "seule", place: null, level: 1 },
  ];
  it("trouve l'étage voisin du même lieu, même avec des trous", () => {
    expect(neighborFloor(maps, maps[0]!, 1)?.id).toBe("haut");
    expect(neighborFloor(maps, maps[0]!, -1)?.id).toBe("cave");
    expect(neighborFloor(maps, maps[2]!, -1)).toBeNull();
    expect(neighborFloor(maps, maps[4]!, 1)).toBeNull();
    expect(levelLabel(-1)).toBe("Niveau -1");
  });

  it("le groupe se pose autour de l'escalier, dans la carte", () => {
    const spots = partySpots({ x: 0.5, y: 5 }, 4, 10, 10);
    expect(spots[0]).toEqual({ x: 0.5, y: 5 });
    expect(new Set(spots.map((p) => `${p.x}:${p.y}`)).size).toBeGreaterThan(2);
    for (const p of spots) expect(p.x).toBeGreaterThanOrEqual(0.5);
  });

  it("un escalier garde le lien vers son étage, un lien illisible est ignoré", () => {
    const link = "0e6f2c4a-1b2c-4d5e-8f90-123456789abc";
    const [ok, bad] = readObjects([
      { id: "a", k: "stairs", x: 1, y: 1, w: 1, h: 2, r: 0, link },
      { id: "b", k: "stairs", x: 1, y: 1, w: 1, h: 2, r: 0, link: "ailleurs" },
    ]);
    expect(ok?.link).toBe(link);
    expect(bad?.link).toBeUndefined();
  });
});
