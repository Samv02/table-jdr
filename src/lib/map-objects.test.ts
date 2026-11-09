import { describe, expect, it } from "vitest";
import { floorOf, type MapShape } from "./map-shapes";
import type { MapEdge } from "./map";
import {
  DEFAULT_STAMP,
  SYMBOL_GROUPS,
  SYMBOL_LABELS,
  hitsObject,
  objectAt,
  readObjects,
  resizeTo,
  restack,
  rotationTo,
  snapObjectCenter,
  stampAt,
  symbolColor,
  symbolGroup,
  updateObject,
  type MapObject,
} from "./map-objects";
import { clearZone, copyZone, pasteClip, zoneFrom } from "./map-zone";

const obj = (patch: Partial<MapObject> = {}): MapObject => ({
  id: "a",
  k: "symbol",
  sym: "Barrel",
  x: 5,
  y: 5,
  w: 2,
  h: 1,
  r: 0,
  ...patch,
});
const team = "11111111-2222-3333-4444-555555555555";

describe("objets de la carte", () => {
  it("lit la colonne en ignorant le reste", () => {
    const list = readObjects([
      obj(),
      obj(), // même identifiant : ignoré
      { ...obj({ id: "b" }), sym: "Inconnu" },
      { id: "c", k: "image", x: 1, y: 1, w: 1, h: 1, r: 0, src: "../../secrets.png" },
      { id: "d", k: "image", x: 1, y: 1, w: 1, h: 1, r: 0, src: `${team}/objets/x.png` },
      { id: "e", k: "text", x: 1, y: 1, w: 1, h: 1, r: 450, text: "   " },
      { id: "f", k: "text", x: 1, y: 1, w: 1, h: 1, r: -90, text: "Salle 1", op: 3 },
      { id: "g", k: "stairs", x: 1, y: 1, w: 1, h: 2, r: 0, color: "rouge" },
    ]);
    expect(list.map((o) => o.id)).toEqual(["a", "d", "f", "g"]);
    expect(list[2]).toMatchObject({ r: 270, text: "Salle 1" });
    expect(list[2]?.op).toBeUndefined();
    expect(list[3]).toMatchObject({ steps: 3 });
    expect(list[3]?.color).toBeUndefined();
  });

  it("chaque symbole a un nom en français", () => {
    for (const g of SYMBOL_GROUPS) for (const id of g.ids) expect(SYMBOL_LABELS[id]).toBeTruthy();
  });

  it("un objet tourné se touche là où il est dessiné", () => {
    const flat = obj();
    expect(hitsObject(flat, { x: 5.9, y: 5 })).toBe(true);
    expect(hitsObject(flat, { x: 5, y: 5.9 })).toBe(false);
    const turned = obj({ r: 90 });
    expect(hitsObject(turned, { x: 5.9, y: 5 })).toBe(false);
    expect(hitsObject(turned, { x: 5, y: 5.9 })).toBe(true);
  });

  it("le pointeur prend l'objet du dessus", () => {
    const list = [obj({ id: "dessous" }), obj({ id: "dessus" })];
    expect(objectAt(list, { x: 5, y: 5 })?.id).toBe("dessus");
    expect(objectAt(restack(list, "dessous", true), { x: 5, y: 5 })?.id).toBe("dessous");
    expect(objectAt(list, { x: 9, y: 9 })).toBeNull();
  });

  it("rotation calée de 15 en 15, taille qui garde ses proportions", () => {
    const o = obj();
    expect(rotationTo(o, { x: 6, y: 5 }, false)).toBe(90);
    expect(rotationTo(o, { x: 5, y: 4 }, false)).toBe(0);
    expect(resizeTo(o, { x: 7, y: 6 }, false)).toEqual({ w: 4, h: 2 });
    expect(resizeTo(o, { x: 7, y: 7 }, true)).toEqual({ w: 4, h: 4 });
  });

  it("les bords d'un objet tombent sur la grille", () => {
    expect(snapObjectCenter({ x: 5.3, y: 5.3 }, obj(), 1, 20, 20)).toEqual({ x: 5, y: 5.5 });
    expect(snapObjectCenter({ x: 5.3, y: 5.3 }, obj(), 0, 20, 20)).toEqual({ x: 5.3, y: 5.3 });
  });

  it("le tampon varie taille et rotation dans les limites choisies", () => {
    let n = 0;
    const rand = () => [0, 1, 0.5, 0.25][n++ % 4]!;
    const o = stampAt({ k: "symbol", sym: "TreePine" }, { x: 3, y: 3 }, DEFAULT_STAMP, [], rand);
    expect(o.w).toBe(DEFAULT_STAMP.min);
    expect(o.r).toBe(90);
    expect(o.id).toBeTruthy();
  });
});

describe("zones", () => {
  const room: MapShape = {
    t: "rect",
    pts: [
      { x: 0, y: 0 },
      { x: 4, y: 4 },
    ],
  };
  const wall: MapEdge = { x: 1, y: 1, dir: "h", kind: "wall" };
  const content = { shapes: [room], edges: [wall], objects: [obj({ x: 1.5, y: 1.5, w: 1, h: 1 })] };

  it("une zone suit les cases entières", () => {
    expect(zoneFrom({ x: 2.6, y: 3.2 }, { x: 0.4, y: 1.1 }, 10, 10)).toEqual({
      x0: 0,
      y0: 1,
      x1: 3,
      y1: 4,
    });
    expect(zoneFrom({ x: 1, y: 1 }, { x: 1, y: 3 }, 10, 10)).toBeNull();
  });

  it("copier puis coller reproduit sol, murs et objets plus loin", () => {
    const clip = copyZone({ x0: 0, y0: 0, x1: 2, y1: 2 }, content, 10, 10);
    expect(clip.w).toBe(2);
    expect(clip.edges).toHaveLength(1);
    expect(clip.objects).toHaveLength(1);
    const pasted = pasteClip(clip, { x: 6.7, y: 6.2 }, content, 10, 10);
    expect(pasted.edges.some((e) => e.x === 7 && e.y === 7)).toBe(true);
    expect(pasted.objects.at(-1)).toMatchObject({ x: 7.5, y: 7.5 });
    expect(pasted.objects.at(-1)?.id).not.toBe("a");
    // Sol d'origine (16) + la copie de 2 × 2
    const area = floorOf(pasted.shapes, 10, 10).reduce((sum, poly) => {
      const ring = poly[0]!;
      let a = 0;
      for (let i = 0; i < ring.length - 1; i++)
        a += ring[i]![0] * ring[i + 1]![1] - ring[i + 1]![0] * ring[i]![1];
      return sum + Math.abs(a / 2);
    }, 0);
    expect(area).toBeCloseTo(20);
  });

  it("vider une zone creuse le sol et retire murs et objets", () => {
    const r = clearZone({ x0: 0, y0: 0, x1: 2, y1: 2 }, content, 10, 10);
    expect(r.edges).toEqual([]);
    expect(r.objects).toEqual([]);
    expect(r.shapes.at(-1)).toMatchObject({ t: "rect", erase: true });
  });
});

describe("styles des symboles et caméras", () => {
  const sym: MapObject = { id: "a", k: "symbol", sym: "Barrel", x: 1, y: 1, w: 1, h: 1, r: 0 };

  it("garde le style choisi, ignore un style inconnu, revient à celui de la carte", () => {
    expect(readObjects([{ ...sym, look: "ink" }])[0]?.look).toBe("ink");
    expect(readObjects([{ ...sym, look: "paillettes" }])[0]?.look).toBeUndefined();
    const inked = updateObject([sym], "a", { look: "neon" });
    expect(inked[0]?.look).toBe("neon");
    expect(updateObject(inked, "a", { look: "auto" })[0]).toEqual(sym);
  });

  it("chaque famille a sa couleur de pastille", () => {
    for (const g of SYMBOL_GROUPS) expect(symbolColor(g.ids[0])).toMatch(/^var\(--/);
    expect(symbolGroup("Barrel")).toBe("Mobilier");
  });

  it("une caméra garde son champ de vision, borné", () => {
    const [cam] = readObjects([
      {
        id: "c",
        k: "camera",
        x: 2,
        y: 2,
        w: 1,
        h: 1,
        r: 90,
        cone: { fov: 500, range: 3 },
        text: "Hall",
      },
    ]);
    expect(cam?.cone).toMatchObject({ fov: 360, range: 3, show: true });
    expect(cam?.text).toBe("Hall");
  });
});
