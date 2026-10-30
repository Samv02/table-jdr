import { describe, expect, it } from "vitest";
import { findFlags, splitFlags, type ModerationWord } from "./moderation";

const word = (w: string, category = "insulte"): ModerationWord => ({ id: w, word: w, category });
const words = [
  word("connard*"),
  word("fdp"),
  word("je vais te tuer", "menace"),
  word("nègre*", "haine"),
];
const hits = (text: string) => findFlags(text, words).map((f) => text.slice(f.start, f.end));

describe("findFlags", () => {
  it("finds a word whatever its case, accents or ending", () => {
    expect(hits("Espèce de CONNARDS")).toEqual(["CONNARDS"]);
    expect(hits("sale negre")).toEqual(["negre"]);
  });
  it("sees through common disguises", () => {
    expect(hits("c0nn4rd")).toEqual(["c0nn4rd"]);
    expect(hits("connnnard")).toEqual(["connnnard"]);
    expect(hits("f.d.p")).toEqual(["f.d.p"]);
  });
  it("matches whole phrases, with variable spacing", () =>
    expect(hits("non je vais  te tuer demain")).toEqual(["je vais  te tuer"]));
  it("ignores a word hidden inside another one", () => {
    expect(hits("confdpas")).toEqual([]);
    expect(hits("le déconnard")).toEqual([]);
  });
  it("leaves role-play vocabulary alone", () =>
    expect(hits("Je tue le gobelin, il est mort")).toEqual([]));
});

describe("splitFlags", () => {
  it("keeps the original text intact", () => {
    const text = "Ça va, CONNARD ?";
    const parts = splitFlags(text, findFlags(text, words));
    expect(parts.map((p) => p.text).join("")).toBe(text);
    expect(parts.filter((p) => p.flagged).map((p) => p.text)).toEqual(["CONNARD"]);
  });
});
