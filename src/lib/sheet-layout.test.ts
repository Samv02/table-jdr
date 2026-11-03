import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHEET_LAYOUT,
  GRID_GAP,
  compactLayout,
  freezeLayout,
  placeBlock,
  readSheetLayout,
  readingOrder,
  resizeBlock,
  resolveLayout,
  toggleBlock,
  type SheetBlock,
} from "./sheet-layout";

const H = 100;
const all = Object.fromEntries(DEFAULT_SHEET_LAYOUT.blocks.map((b) => [b.key, H])) as Record<
  SheetBlock,
  number
>;
const find = (l: { blocks: { key: string }[] }, key: string) => l.blocks.find((b) => b.key === key);

describe("disposition de la fiche", () => {
  it("garde les trois colonnes d'origine sans réglage enregistré", () => {
    const l = readSheetLayout({});
    expect(l).toEqual(DEFAULT_SHEET_LAYOUT);
    const { tops } = resolveLayout(l.blocks, all);
    expect(tops.ident).toBe(0);
    expect(tops.vitals).toBe(H + GRID_GAP);
    expect(tops.skills).toBe(0);
    expect(tops.weapons).toBe(0);
    expect(tops.slots).toBe(H + GRID_GAP);
  });

  it("repart de l'origine pour l'ancien format en colonnes", () => {
    expect(readSheetLayout({ columns: 2, blocks: [{ key: "skills", col: 0 }] })).toEqual(
      DEFAULT_SHEET_LAYOUT,
    );
  });

  it("ignore blocs inconnus et doublons, garde chaque bloc dans le plateau", () => {
    const l = readSheetLayout({
      blocks: [
        { key: "skills", x: 10, y: 33, w: 6, hidden: true },
        { key: "skills", x: 0, y: 0, w: 4 },
        { key: "pirate", x: 0, y: 0, w: 4 },
        { key: "money", x: -3, y: -50, w: 40 },
      ],
    });
    expect(l.blocks).toHaveLength(DEFAULT_SHEET_LAYOUT.blocks.length);
    expect(find(l, "skills")).toEqual({ key: "skills", x: 6, y: 30, w: 6, hidden: true });
    expect(find(l, "money")).toEqual({ key: "money", x: 0, y: 0, w: 12, hidden: false });
  });

  it("garde un espace vide voulu au-dessus d'un bloc", () => {
    const l = placeBlock(DEFAULT_SHEET_LAYOUT, "skills", 4, 500);
    expect(resolveLayout(l.blocks, all).tops.skills).toBe(500);
  });

  it("un bloc qui grandit pousse celui du dessous au lieu de le recouvrir", () => {
    const frozen = freezeLayout(
      DEFAULT_SHEET_LAYOUT,
      resolveLayout(DEFAULT_SHEET_LAYOUT.blocks, all).tops,
    );
    const { tops } = resolveLayout(frozen.blocks, { ...all, ident: 400 });
    expect(tops.vitals).toBe(400 + GRID_GAP);
    expect(tops.stats).toBe(400 + GRID_GAP + H + GRID_GAP);
  });

  it("un bloc posé sur un autre le fait descendre", () => {
    const frozen = freezeLayout(
      DEFAULT_SHEET_LAYOUT,
      resolveLayout(DEFAULT_SHEET_LAYOUT.blocks, all).tops,
    );
    const l = placeBlock(frozen, "money", 0, 0);
    const { tops } = resolveLayout(l.blocks, all);
    expect(tops.money).toBe(0);
    expect(tops.ident).toBe(H + GRID_GAP);
  });

  it("deux blocs côte à côte ne se gênent pas", () => {
    const l = placeBlock(resizeBlock(DEFAULT_SHEET_LAYOUT, "skills", 2), "money", 6, 0);
    const { tops } = resolveLayout(l.blocks, all);
    expect(tops.skills).toBe(0);
    expect(tops.money).toBe(0);
  });

  it("la largeur reste entre 2 et 12 colonnes, sans dépasser le bord droit", () => {
    expect(find(resizeBlock(DEFAULT_SHEET_LAYOUT, "weapons", 9), "weapons")).toMatchObject({
      x: 3,
      w: 9,
    });
    expect(find(resizeBlock(DEFAULT_SHEET_LAYOUT, "ident", 0), "ident")).toMatchObject({ w: 2 });
    expect(find(placeBlock(DEFAULT_SHEET_LAYOUT, "ident", 11, 0), "ident")).toMatchObject({ x: 8 });
  });

  it("Resserrer retire les espaces sans changer l'ordre", () => {
    const gap = placeBlock(DEFAULT_SHEET_LAYOUT, "skills", 4, 800);
    const { tops } = resolveLayout(gap.blocks, all);
    const tight = compactLayout(gap, tops);
    expect(resolveLayout(tight.blocks, all).tops.skills).toBe(0);
  });

  it("téléphone : lecture de haut en bas puis de gauche à droite", () => {
    const l = placeBlock(DEFAULT_SHEET_LAYOUT, "ident", 0, 300);
    expect(
      readingOrder(l)
        .map((b) => b.key)
        .at(-1),
    ).toBe("ident");
  });

  it("masque et réaffiche un bloc", () => {
    const hidden = toggleBlock(DEFAULT_SHEET_LAYOUT, "shop", true);
    expect(find(hidden, "shop")).toMatchObject({ hidden: true });
    expect(toggleBlock(hidden, "shop", false)).toEqual(DEFAULT_SHEET_LAYOUT);
  });
});
