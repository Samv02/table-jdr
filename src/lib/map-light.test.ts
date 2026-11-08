import { describe, expect, it } from "vitest";
import type { MapEdge } from "./map";
import { readObjects } from "./map-objects";
import {
  DEFAULT_LIGHT,
  emptyMask,
  fillMask,
  hiddenCells,
  isRevealed,
  lightSources,
  maskToText,
  paintMask,
  readLight,
  readMask,
  revealRoom,
} from "./map-light";

describe("éclairage", () => {
  it("sans réglage, la nuit est éteinte", () => {
    expect(readLight({})).toEqual(DEFAULT_LIGHT);
    expect(readLight({ on: true, night: "bleu", dark: 4, party: -2 })).toEqual({
      ...DEFAULT_LIGHT,
      on: true,
      dark: 1,
    });
  });

  it("une lumière se relit avec sa portée, bornée", () => {
    const [l] = readObjects([
      { id: "l", k: "light", x: 2, y: 2, w: 0.8, h: 0.8, r: 0, rad: 500, bright: 2 },
    ]);
    expect(l).toMatchObject({ k: "light", rad: 60, bright: 1 });
  });

  it("sources : les lumières posées, puis les pions du groupe s'ils éclairent", () => {
    const objects = readObjects([
      { id: "l", k: "light", x: 2, y: 2, w: 0.8, h: 0.8, r: 0, rad: 3, op: 0.5 },
      { id: "s", k: "symbol", sym: "Barrel", x: 1, y: 1, w: 1, h: 1, r: 0 },
    ]);
    const party = [{ x: 5, y: 5 }];
    expect(lightSources(objects, party, DEFAULT_LIGHT)).toEqual([
      { x: 2, y: 2, rad: 3, bright: 0.5, color: null, power: 0.5 },
    ]);
    expect(lightSources(objects, party, { ...DEFAULT_LIGHT, party: 4 })).toHaveLength(2);
  });
});

describe("brouillard à la main", () => {
  it("tout est caché au départ, le masque se relit à l'identique", () => {
    const m = paintMask(emptyMask(), { x: 3.5, y: 3.5 }, 1, true, 10, 10);
    expect(isRevealed(emptyMask(), 3, 3)).toBe(false);
    expect(isRevealed(m, 3, 3)).toBe(true);
    expect(readMask(maskToText(m))).toEqual(m);
    expect(maskToText(m).length).toBeLessThanOrEqual(1700);
    expect(readMask("pas du base64 !!")).toEqual(emptyMask());
  });

  it("le pinceau révèle un disque et peut recacher", () => {
    const m = paintMask(emptyMask(), { x: 5, y: 5 }, 1, true, 10, 10);
    expect(10 * 10 - hiddenCells(m, 10, 10).size).toBe(4);
    const back = paintMask(m, { x: 4.5, y: 4.5 }, 0.5, false, 10, 10);
    expect(isRevealed(back, 4, 4)).toBe(false);
    expect(isRevealed(back, 5, 5)).toBe(true);
  });

  it("le pinceau ne sort pas de la carte", () => {
    const m = paintMask(emptyMask(), { x: 0, y: 0 }, 3, true, 2, 2);
    expect(hiddenCells(m, 2, 2).size).toBe(0);
    expect(isRevealed(m, 2, 0)).toBe(false);
  });

  it("révéler une pièce s'arrête aux murs", () => {
    // Une cloison verticale en x = 3, de haut en bas d'une carte de 6 × 2
    const wall: MapEdge[] = [0, 1].map((y) => ({ x: 3, y, dir: "v", kind: "wall" }));
    const m = revealRoom(emptyMask(), { x: 0.5, y: 0.5 }, wall, [], 6, 2, true);
    expect(isRevealed(m, 2, 1)).toBe(true);
    expect(isRevealed(m, 3, 0)).toBe(false);
  });

  it("tout révéler, tout cacher", () => {
    expect(hiddenCells(fillMask(true, 8, 8), 8, 8).size).toBe(0);
    expect(hiddenCells(fillMask(false, 8, 8), 8, 8).size).toBe(64);
  });
});
