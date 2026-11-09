import { describe, expect, it } from "vitest";
import { blockers, visibility, type MapEdge } from "./map";
import {
  DEFAULT_CONE,
  directionName,
  inCone,
  lookAt,
  readTokenCone,
  sectorPoints,
  spotted,
  type Cone,
} from "./map-cones";

const cone = (patch: Partial<Cone> = {}): Cone => ({ ...DEFAULT_CONE, ...patch });
const o = { x: 5, y: 5 };

describe("champs de vision", () => {
  it("voit devant, à portée et dans l'ouverture", () => {
    const c = cone({ fov: 90, range: 4 });
    // Regarde vers la droite (90°)
    expect(inCone(o, 90, c, { x: 8, y: 5 })).toBe(true);
    expect(inCone(o, 90, c, { x: 8, y: 7.5 })).toBe(true);
    expect(inCone(o, 90, c, { x: 10, y: 5 })).toBe(false);
    expect(inCone(o, 90, c, { x: 2, y: 5 })).toBe(false);
    expect(inCone(o, 90, c, { x: 5, y: 2 })).toBe(false);
    // Vers le haut (0°)
    expect(inCone(o, 0, c, { x: 5, y: 2 })).toBe(true);
    expect(inCone(o, 0, cone({ fov: 360, range: 4 }), { x: 5, y: 8 })).toBe(true);
  });

  it("l'angle passe par le nord sans se tromper", () => {
    const c = cone({ fov: 60, range: 5 });
    expect(inCone(o, 350, c, { x: 5.5, y: 2 })).toBe(true);
    expect(inCone(o, 10, c, { x: 4.5, y: 2 })).toBe(true);
  });

  it("un mur arrête le regard", () => {
    const wall: MapEdge[] = Array.from({ length: 10 }, (_, y) => ({
      x: 7,
      y,
      dir: "v" as const,
      kind: "wall" as const,
    }));
    const sight = visibility(o, blockers(wall), 12, 10);
    const c = cone({ fov: 90, range: 6 });
    expect(inCone(o, 90, c, { x: 6.5, y: 5 }, sight)).toBe(true);
    expect(inCone(o, 90, c, { x: 8, y: 5 }, sight)).toBe(false);
  });

  it("balaye de part et d'autre, ou reste fixe", () => {
    const fixed = cone({ sweep: 40, speed: 0 });
    expect(lookAt(90, fixed, 1234)).toBe(90);
    const slow = cone({ sweep: 40, speed: 1 });
    expect(lookAt(90, slow, 0)).toBeCloseTo(90);
    expect(lookAt(90, slow, 2000)).toBeCloseTo(130);
    expect(lookAt(90, slow, 6000)).toBeCloseTo(50);
  });

  it("dit qui est repéré, et par qui", () => {
    const sources = [
      { id: "c1", label: "Caméra", origin: o, dir: 90, cone: cone({ fov: 90, range: 4 }) },
    ];
    const spots = spotted(
      sources,
      [
        { id: "a", label: "Alex", x: 7, y: 5 },
        { id: "b", label: "Mika", x: 1, y: 1 },
      ],
      0,
    );
    expect(spots).toEqual([
      { source: "c1", sourceLabel: "Caméra", target: "a", targetLabel: "Alex" },
    ]);
  });

  it("relit le cône d'un pion, borné", () => {
    expect(readTokenCone(null)).toBeNull();
    expect(readTokenCone({ dir: 450, fov: 999, range: -2, speed: 7, show: "oui" })).toEqual({
      dir: 90,
      fov: 360,
      range: 0.5,
      sweep: 0,
      speed: 2,
      show: true,
    });
  });

  it("contour et noms de direction", () => {
    expect(sectorPoints(o, 0, cone({ fov: 90, range: 2 }), 2)[0]).toEqual(o);
    expect(sectorPoints(o, 0, cone({ fov: 360, range: 2 }), 4)).toHaveLength(8);
    expect(directionName(0)).toBe("haut");
    expect(directionName(95)).toBe("droite");
    expect(directionName(-45)).toBe("haut-gauche");
  });
});
