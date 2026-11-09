import { describe, expect, it } from "vitest";
import { floorOf, readShapes, type MapShape } from "./map-shapes";
import {
  DEFAULT_MAP_STYLE,
  MAP_STYLES,
  STYLE_ERAS,
  applyPreset,
  hatchTile,
  isTweaked,
  readMapStyle,
  styleToJson,
  styleVars,
} from "./map-style";

describe("apparence de la carte", () => {
  it("sans réglage, la carte suit le thème", () => {
    expect(readMapStyle({})).toEqual(DEFAULT_MAP_STYLE);
    expect(readMapStyle(null)).toEqual(DEFAULT_MAP_STYLE);
    expect(styleVars(DEFAULT_MAP_STYLE)).toEqual({ "--map-wall-w": "5" });
  });

  it("chaque style se relit à l'identique", () => {
    for (const p of MAP_STYLES) {
      const st = applyPreset(p.id);
      expect(styleToJson(st)).toEqual({ preset: p.id });
      expect(readMapStyle(styleToJson(st))).toEqual(st);
      expect(isTweaked(st)).toBe(false);
    }
  });

  it("n'enregistre que les retouches, et les garde", () => {
    const st = { ...applyPreset("parchment"), wall: "#123456", hatch: false };
    const json = styleToJson(st);
    expect(json).toEqual({ preset: "parchment", wall: "#123456", hatch: false });
    expect(readMapStyle(json)).toEqual(st);
    expect(isTweaked(st)).toBe(true);
  });

  it("une valeur illisible reprend celle du style", () => {
    const st = readMapStyle({ preset: "hatch", wall: "rouge", wallWidth: 400, shadow: "oui" });
    const base = applyPreset("hatch");
    expect(st.wall).toBe(base.wall);
    expect(st.wallWidth).toBe(20);
    expect(st.shadow).toBe(base.shadow);
    expect(readMapStyle({ preset: "inconnu" }).preset).toBe("theme");
  });

  it("une couleur remise au thème reste au thème", () => {
    const st = { ...applyPreset("hatch"), floor: null };
    expect(readMapStyle(styleToJson(st)).floor).toBeNull();
    expect(styleVars(st)["--map-ground"]).toBeUndefined();
    expect(styleVars(st)["--map-wall"]).toBe("#111111");
  });

  it("thèmes : chacun a son époque, et un effet illisible reprend celui du thème", () => {
    expect(new Set(MAP_STYLES.map((p) => p.id)).size).toBe(MAP_STYLES.length);
    for (const era of STYLE_ERAS) expect(MAP_STYLES.some((p) => p.era === era.id)).toBe(true);
    const neon = applyPreset("neon");
    const st = readMapStyle({
      preset: "neon",
      texture: "velours",
      wallLine: 3,
      font: "comic",
      glow: 9,
      vignette: "oui",
    });
    expect(st).toMatchObject({
      texture: neon.texture,
      wallLine: neon.wallLine,
      font: neon.font,
      glow: 1,
      vignette: neon.vignette,
    });
    expect(styleVars(neon)["--map-glow"]).toBe("11px");
    expect(styleVars(applyPreset("architect"))["--map-font"]).toBe("var(--mono)");
    // Un ancien style garde ses couleurs : seuls les effets s'ajoutent
    expect(readMapStyle({ preset: "hatch" }).texture).toBe("none");
  });

  it("les hachures sont les mêmes sur chaque écran", () => {
    expect(hatchTile(80)).toEqual(hatchTile(80));
    expect(hatchTile(80)).toHaveLength(4 * 4 * 3);
  });
});

describe("matières", () => {
  const water: MapShape = {
    t: "rect",
    layer: "water",
    pts: [
      { x: 0, y: 0 },
      { x: 2, y: 2 },
    ],
  };
  const room: MapShape = {
    t: "rect",
    pts: [
      { x: 0, y: 0 },
      { x: 4, y: 4 },
    ],
  };

  it("l'eau ne fait pas partie du sol, et le sol ne creuse pas l'eau", () => {
    expect(floorOf([room, water], 10, 10, "floor")).toEqual(floorOf([room], 10, 10));
    expect(floorOf([water, { ...room, erase: true }], 10, 10, "water")).toHaveLength(1);
    expect(floorOf([water, { ...water, erase: true }], 10, 10, "water")).toEqual([]);
  });

  it("la matière se relit, une matière inconnue devient du sol", () => {
    expect(
      readShapes([
        {
          t: "rect",
          layer: "lava",
          pts: [
            [0, 0],
            [1, 1],
          ],
        },
      ])[0]?.layer,
    ).toBe("lava");
    expect(
      readShapes([
        {
          t: "rect",
          layer: "acide",
          pts: [
            [0, 0],
            [1, 1],
          ],
        },
      ])[0]?.layer,
    ).toBe(undefined);
  });
});
