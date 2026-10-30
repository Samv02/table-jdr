import { describe, expect, it } from "vitest";
import {
  canActivate,
  fitToCapacity,
  newProgram,
  parseProgramDice,
  readPrograms,
  toggleProgram,
  usedSlots,
  type Program,
} from "./programs";

const p = (id: string, slots: number | null, active = false): Program => ({
  id,
  name: id,
  slots,
  dice: "",
  effect: "",
  active,
});

describe("cyberdeck", () => {
  const deck = [
    p("sword", 2, true),
    p("shield", 2, true),
    p("eraser", 1),
    p("zap", 1),
    p("neuf", null),
  ];

  it("compte seulement les programmes actifs", () => {
    expect(usedSlots(deck)).toBe(4);
  });

  it("refuse une activation qui dépasse les slots, et dit combien il en manque", () => {
    expect(canActivate(deck, 5, "eraser")).toEqual({ ok: true });
    expect(canActivate(deck, 4, "eraser")).toEqual({ ok: false, reason: "room", missing: 1 });
    expect(toggleProgram(deck, 4, "eraser")).toBeNull();
    const after = toggleProgram(deck, 5, "eraser")!;
    expect(usedSlots(after)).toBe(5);
    expect(toggleProgram(after, 5, "zap")).toBeNull();
  });

  it("désactiver libère toujours de la place", () => {
    const off = toggleProgram(deck, 4, "sword")!;
    expect(usedSlots(off)).toBe(2);
    expect(canActivate(off, 4, "eraser").ok).toBe(true);
  });

  it("un programme sans coût fixé par le MJ n'est pas activable", () => {
    expect(canActivate(deck, 99, "neuf")).toEqual({ ok: false, reason: "pending" });
    expect(newProgram("Kraken", false).slots).toBeNull();
    expect(newProgram("Kraken", true).slots).toBe(1);
  });

  it("le MJ réduit le deck : on désactive ce qui ne rentre plus", () => {
    const fit = fitToCapacity(deck, 2);
    expect(usedSlots(fit)).toBe(2);
    expect(fit.find((x) => x.id === "sword")!.active).toBe(true);
    const grown = deck.map((x) => (x.id === "sword" ? { ...x, slots: 4 } : x));
    const fit2 = fitToCapacity(grown, 4, "sword");
    expect(fit2.find((x) => x.id === "sword")!.active).toBe(false);
    expect(fit2.find((x) => x.id === "shield")!.active).toBe(true);
  });

  it("lit les dés", () => {
    expect(parseProgramDice("2d6+1")).toEqual({ count: 2, sides: 6, mod: 1 });
    expect(parseProgramDice("d10")).toEqual({ count: 1, sides: 10, mod: 0 });
    expect(parseProgramDice(" 3D6 - 2 ")).toEqual({ count: 3, sides: 6, mod: -2 });
    expect(parseProgramDice("abc")).toBeNull();
    expect(parseProgramDice("")).toBeNull();
  });

  it("tolère des données abîmées", () => {
    expect(readPrograms(null)).toEqual([]);
    expect(readPrograms([{ id: "a", slots: "3", active: true }, { name: "sans id" }])).toEqual([
      { id: "a", name: "", slots: 3, dice: "", effect: "", active: true },
    ]);
  });
});
