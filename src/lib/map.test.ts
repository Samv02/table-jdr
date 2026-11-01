import { describe, expect, it } from "vitest";
import {
  blockers,
  cellAt,
  clampSize,
  clampToken,
  distance,
  edgeKey,
  edgesBetween,
  eraseTarget,
  fitCamera,
  formatDistance,
  inPolygon,
  insideMap,
  nearestCorner,
  nearestEdge,
  nextLabel,
  readEdges,
  removeEdge,
  roomEdges,
  setEdge,
  snapToCell,
  toggleDoor,
  visibility,
  ZOOM_MAX,
  zoomAt,
  type MapEdge,
} from "./map";

const wall: MapEdge = { x: 1, y: 2, dir: "h", kind: "wall" };

describe("readEdges", () => {
  it("ignores unreadable rows and keeps one element per edge", () => {
    expect(
      readEdges([wall, { ...wall, kind: "door" }, { x: 1.5, y: 0, dir: "h" }, null, "x"]),
    ).toEqual([{ ...wall, kind: "door" }]);
    expect(readEdges("rien")).toEqual([]);
  });
  it("only keeps a door open", () => {
    expect(readEdges([{ ...wall, open: true }])[0]).toEqual(wall);
    expect(readEdges([{ ...wall, kind: "door", open: true }])[0]?.open).toBe(true);
  });
});

describe("door types", () => {
  const trap: MapEdge = { x: 2, y: 3, dir: "c", kind: "door", door: "trap" };
  it("keeps the type and reads old doors as simple ones", () => {
    const secret: MapEdge = { ...wall, kind: "door", door: "secret", open: true };
    expect(readEdges([secret])).toEqual([secret]);
    expect(readEdges([{ ...wall, kind: "door" }])[0]?.door).toBeUndefined();
    expect(readEdges([{ ...wall, kind: "door", door: "inconnu" }])[0]?.door).toBeUndefined();
    expect(readEdges([{ ...wall, door: "secret" }])).toEqual([wall]);
  });
  it("only allows a trapdoor on the floor of a cell", () => {
    expect(readEdges([trap])).toEqual([trap]);
    expect(readEdges([{ ...wall, kind: "door", door: "trap" }])).toEqual([]);
    expect(readEdges([{ ...trap, door: "double" }])).toEqual([]);
  });
  it("keeps cells inside the map", () => {
    expect(insideMap({ x: 3, y: 3, dir: "c" }, 4, 4)).toBe(true);
    expect(insideMap({ x: 4, y: 0, dir: "c" }, 4, 4)).toBe(false);
    expect(cellAt({ x: 50, y: -2 }, 10, 8)).toEqual({ x: 9, y: 0, dir: "c" });
  });
  it("opens a trapdoor and keeps its type", () => {
    expect(toggleDoor([trap], edgeKey(trap))).toEqual([{ ...trap, open: true }]);
  });
  it("erases the trapdoor under the pointer, the edge otherwise", () => {
    expect(eraseTarget([trap], { x: 2.5, y: 3.5 }, 10, 10)).toEqual(cellAt(trap, 10, 10));
    expect(eraseTarget([trap], { x: 2.5, y: 3.05 }, 10, 10)).toEqual({ x: 2, y: 3, dir: "h" });
    expect(eraseTarget([], { x: 2.5, y: 3.4 }, 10, 10).dir).toBe("h");
  });
  it("lets the view through bars and over trapdoors, never through a closed secret door", () => {
    const door = (d: MapEdge["door"]): MapEdge => ({
      ...wall,
      kind: "door",
      ...(d ? { door: d } : {}),
    });
    expect(blockers([door("bars"), trap])).toEqual([]);
    expect(blockers([door("double")])).toHaveLength(1);
    expect(blockers([door("secret")])).toHaveLength(1);
    expect(blockers([{ ...door("secret"), open: true }])).toEqual([]);
  });
});

describe("grid", () => {
  it("snaps to the closest side of the cell", () => {
    expect(nearestEdge({ x: 2.5, y: 3.1 }, 10, 10)).toEqual({ x: 2, y: 3, dir: "h" });
    expect(nearestEdge({ x: 2.5, y: 3.9 }, 10, 10)).toEqual({ x: 2, y: 4, dir: "h" });
    expect(nearestEdge({ x: 2.1, y: 3.5 }, 10, 10)).toEqual({ x: 2, y: 3, dir: "v" });
    expect(nearestEdge({ x: 2.9, y: 3.5 }, 10, 10)).toEqual({ x: 3, y: 3, dir: "v" });
  });
  it("stays on the map outside its borders", () => {
    const e = nearestEdge({ x: 50, y: -4 }, 10, 8);
    expect(insideMap(e, 10, 8)).toBe(true);
    expect(nearestCorner({ x: 50, y: -4 }, 10, 8)).toEqual({ x: 10, y: 0 });
  });
  it("links two corners along the grid, whatever the direction", () => {
    expect(edgesBetween({ x: 3, y: 1 }, { x: 1, y: 1 }).map(edgeKey)).toEqual(["h:1:1", "h:2:1"]);
    expect(edgesBetween({ x: 0, y: 0 }, { x: 1, y: 2 }).map(edgeKey)).toEqual([
      "h:0:0",
      "v:1:0",
      "v:1:1",
    ]);
  });
  it("accepts the last border but not beyond", () => {
    expect(insideMap({ x: 4, y: 0, dir: "v" }, 4, 4)).toBe(true);
    expect(insideMap({ x: 4, y: 0, dir: "h" }, 4, 4)).toBe(false);
  });
  it("keeps sizes within the limits", () => {
    expect([clampSize(1), clampSize(300), clampSize(12.4), clampSize(NaN)]).toEqual([
      4, 100, 12, 4,
    ]);
  });
});

describe("edges", () => {
  it("replaces what stands on the same edge", () => {
    const next = setEdge([wall], { ...wall, kind: "door" });
    expect(next).toEqual([{ ...wall, kind: "door" }]);
  });
  it("removes one edge", () => {
    expect(removeEdge([wall], edgeKey(wall))).toEqual([]);
  });
  it("opens and closes doors, never walls", () => {
    const door = { ...wall, kind: "door" as const };
    const opened = toggleDoor([door], edgeKey(door));
    expect(opened[0]?.open).toBe(true);
    expect(toggleDoor(opened, edgeKey(door))[0]).toEqual(door);
    expect(toggleDoor([wall], edgeKey(wall))).toEqual([wall]);
  });
});

describe("tokens", () => {
  it("moves freely inside the map, off the grid", () => {
    expect(clampToken({ x: 3.27, y: 8.91 }, 10, 10)).toEqual({ x: 3.27, y: 8.91 });
    expect(clampToken({ x: -1, y: 40 }, 10, 10)).toEqual({ x: 0, y: 10 });
  });
  it("numbers labels with the first free number", () => {
    expect(nextLabel("Ennemi", ["Ennemi 1", "Ennemi 3"])).toBe("Ennemi 2");
  });
});

describe("rooms and scale", () => {
  it("outlines a room whatever the drag direction", () => {
    const keys = roomEdges({ x: 3, y: 2 }, { x: 1, y: 1 }).map(edgeKey).sort();
    expect(keys).toEqual(["h:1:1", "h:1:2", "h:2:1", "h:2:2", "v:1:1", "v:3:1"]);
  });
  it("uses the map's own scale", () => {
    expect(formatDistance(distance({ x: 0, y: 0 }, { x: 3, y: 4 }), 1.5, "m")).toBe("7,5 m");
  });
  it("snaps a token to the middle of its cell", () => {
    expect(snapToCell({ x: 3.9, y: 0.1 }, 10, 10)).toEqual({ x: 3.5, y: 0.5 });
    expect(snapToCell({ x: 10, y: 10 }, 10, 10)).toEqual({ x: 9.5, y: 9.5 });
  });
});

describe("vision", () => {
  const wall = (x: number, y: number, dir: "h" | "v"): MapEdge => ({ x, y, dir, kind: "wall" });
  it("merges neighbouring edges and leaves gaps", () => {
    expect(blockers([wall(1, 2, "h"), wall(2, 2, "h"), wall(4, 2, "h")])).toEqual([
      { a: { x: 1, y: 2 }, b: { x: 3, y: 2 } },
      { a: { x: 4, y: 2 }, b: { x: 5, y: 2 } },
    ]);
  });
  it("lets the view through an open door only", () => {
    const door: MapEdge = { x: 0, y: 5, dir: "h", kind: "door" };
    const row = Array.from({ length: 9 }, (_, i) => wall(i + 1, 5, "h"));
    const eye = { x: 0.5, y: 2 };
    const behind = { x: 0.5, y: 8 };
    const closed = visibility(eye, blockers([...row, door]), 10, 10);
    const opened = visibility(eye, blockers([...row, { ...door, open: true }]), 10, 10);
    expect(inPolygon(behind, closed)).toBe(false);
    expect(inPolygon(behind, opened)).toBe(true);
  });
  it("sees the whole map without walls", () => {
    expect(inPolygon({ x: 9.9, y: 0.1 }, visibility({ x: 5, y: 5 }, [], 10, 10))).toBe(true);
  });
  it("hides what stands behind a wall", () => {
    const line = [3, 4, 5, 6].map((y) => wall(4, y, "v"));
    const poly = visibility({ x: 2, y: 5 }, blockers(line), 10, 10);
    expect(inPolygon({ x: 7, y: 5 }, poly)).toBe(false);
    expect(inPolygon({ x: 3, y: 5 }, poly)).toBe(true);
  });
});

describe("camera", () => {
  it("keeps the point under the cursor in place", () => {
    expect(zoomAt({ x: 10, y: 20, k: 1 }, 110, 120, 2)).toEqual({ k: 2, x: -90, y: -80 });
  });
  it("respects the zoom limits", () => {
    expect(zoomAt({ x: 0, y: 0, k: 4 }, 0, 0, 10).k).toBe(ZOOM_MAX);
  });
  it("fits and centres the map", () => {
    expect(fitCamera(800, 600, 1000, 1000, 100)).toEqual({ k: 1, x: 100, y: 200 });
  });
});
