import { describe, expect, it } from "vitest";
import { FILE_FORMAT, IMAGE_MAX_PIXELS, fileName, imageSize, readMapFile } from "./map-export";

const file = (patch: Record<string, unknown> = {}) =>
  JSON.stringify({
    format: FILE_FORMAT,
    version: 1,
    map: {
      name: "Crypte",
      width: 20,
      height: 12,
      walls: [{ x: 1, y: 1, dir: "h", kind: "wall" }],
      shapes: [
        {
          t: "rect",
          pts: [
            [0, 0],
            [4, 4],
          ],
        },
      ],
      objects: [{ id: "a", k: "text", text: "1", x: 2, y: 2, w: 1, h: 0.7, r: 0 }],
      vision_mode: "room",
    },
    layers: [{ name: "Secret", hidden: true, shapes: [], objects: [] }],
    tokens: [
      { kind: "enemy", label: "Goule", x: 3, y: 3, size: 9, color: "pink" },
      { kind: "party", label: "Alex", x: 1, y: 1 },
      { kind: "ally", label: "Guide", x: 99, y: 2, color: "orange" },
    ],
    ...patch,
  });

describe("fichier de carte", () => {
  it("relit une carte enregistrée", () => {
    const f = readMapFile(file());
    expect(f?.map).toMatchObject({ name: "Crypte", width: 20, height: 12, vision_mode: "room" });
    expect(f?.map.walls).toHaveLength(1);
    expect(f?.map.shapes).toHaveLength(1);
    expect(f?.map.objects[0]).toMatchObject({ k: "text", text: "1" });
    expect(f?.layers[0]).toMatchObject({ name: "Secret", hidden: true, locked: false });
  });

  it("garde les ennemis et alliés, jamais les pions du groupe, dans les limites de la base", () => {
    const tokens = readMapFile(file())?.tokens ?? [];
    expect(tokens.map((t) => t.label)).toEqual(["Goule", "Guide"]);
    expect(tokens[0]).toMatchObject({ size: 4, color: "pink" });
    expect(tokens[1]).toMatchObject({ x: 20, color: null });
  });

  it("refuse ce qui n'est pas une carte, et borne le reste", () => {
    expect(readMapFile("pas du json")).toBeNull();
    expect(readMapFile(JSON.stringify({ format: "autre" }))).toBeNull();
    const f = readMapFile(
      file({ map: { name: "   ", width: 900, height: -3, fog_mask: "x".repeat(5000) } }),
    );
    expect(f?.map).toMatchObject({ name: "Carte importée", width: 100, height: 4, fog_mask: "" });
  });
});

describe("export en image", () => {
  it("nom de fichier sans accents ni caractères gênants", () => {
    expect(fileName("Crypte d’Élise / niveau 2", "png")).toBe("Crypte-d-Elise-niveau-2.png");
    expect(fileName("???", "png")).toBe("carte.png");
  });

  it("taille finale, réduite au-delà de la limite", () => {
    expect(imageSize(24, 16, 40, 70)).toMatchObject({ width: 1680, height: 1120, reduced: false });
    const big = imageSize(100, 100, 40, 140);
    expect(big.reduced).toBe(true);
    expect(big.width * big.height).toBeLessThanOrEqual(IMAGE_MAX_PIXELS);
  });
});
