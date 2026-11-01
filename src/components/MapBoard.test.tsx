import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EdgeMark } from "./MapBoard";
import type { MapEdge } from "@/lib/map";

const secret: MapEdge = { x: 1, y: 1, dir: "h", kind: "door", door: "secret" };
const wall: MapEdge = { x: 1, y: 1, dir: "h", kind: "wall" };
const draw = (edge: MapEdge, gm: boolean) => renderToStaticMarkup(<EdgeMark edge={edge} gm={gm} />);

describe("EdgeMark", () => {
  it("shows a closed secret door to players exactly like a wall", () => {
    expect(draw(secret, false)).toBe(draw(wall, false));
  });
  it("shows it to the GM, and to everyone once open", () => {
    expect(draw(secret, true)).toContain("map-door secret");
    expect(draw({ ...secret, open: true }, false)).toContain("map-door open");
  });
  it("gives each door type its own look", () => {
    const base: MapEdge = { ...wall, kind: "door" };
    expect(draw({ ...base, door: "double" }, true)).toContain("map-door double");
    expect(draw({ ...base, door: "double", open: true }, true)).toContain("map-door leaf");
    expect(draw({ ...base, door: "bars" }, true)).toContain("map-door bars");
    expect(draw({ ...base, dir: "c", door: "trap" }, true)).toContain("map-trap");
  });
});
