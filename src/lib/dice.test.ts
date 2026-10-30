import { describe, expect, it } from "vitest";
import { formula, resolveDisplayName, rollDie, validateRoll } from "./dice";

const base = {
  dice_count: 2,
  dice_sides: 10,
  modifier: 0,
  label: null,
  is_secret: false,
  character_id: null,
};

describe("dice rules", () => {
  it("dice count must be 1 to 10", () => {
    expect(validateRoll({ ...base, dice_count: 0 })).not.toBeNull();
    expect(validateRoll({ ...base, dice_count: 11 })).not.toBeNull();
    expect(validateRoll({ ...base, dice_count: 10 })).toBeNull();
  });
  it("accepts custom dice and standard dice", () => {
    for (const sides of [2, 3, 4, 6, 7, 8, 10, 12, 20, 100, 10000]) {
      expect(validateRoll({ ...base, dice_sides: sides })).toBeNull();
    }
  });
  it("rejects invalid custom face counts", () => {
    for (const sides of [0, 1, -7, 7.5, 10001, NaN, Infinity]) {
      expect(validateRoll({ ...base, dice_sides: sides })).not.toBeNull();
    }
  });
  it("custom die results stay within their faces", () => {
    for (const sides of [3, 7, 10000]) {
      for (let i = 0; i < 100; i++) {
        const result = rollDie(sides);
        expect(Number.isInteger(result) && result >= 1 && result <= sides).toBe(true);
      }
    }
  });
  it("die stays in range", () => {
    for (let i = 0; i < 500; i++) {
      const r = rollDie(6);
      expect(r >= 1 && r <= 6).toBe(true);
    }
  });
  it("formula", () => {
    expect(formula(2, 10, 3)).toBe("2d10 + 3");
  });
});

describe("roll identity (personne ne lance au nom d'un autre)", () => {
  const mine = { owner_id: "u1", handle: "SUDO", name: "Sudo" };
  const theirs = { owner_id: "u2", handle: "KAIRA", name: "Kaïra" };

  it("un joueur qui envoie le character_id d'un autre joueur → erreur", () => {
    expect(() =>
      resolveDisplayName({ userId: "u1", isGm: false, characterId: "c2", character: theirs }),
    ).toThrow("Tu ne peux lancer les dés que pour ton propre personnage.");
  });
  it("le MJ qui envoie le character_id d'un joueur → erreur", () => {
    expect(() =>
      resolveDisplayName({ userId: "gm1", isGm: true, characterId: "c2", character: theirs }),
    ).toThrow("Tu ne peux lancer les dés que pour ton propre personnage.");
  });
  it("le MJ sans character_id → display_name = MJ", () => {
    expect(
      resolveDisplayName({ userId: "gm1", isGm: true, characterId: null, character: null }),
    ).toBe("MJ");
  });
  it("un joueur sans character_id → erreur", () => {
    expect(() =>
      resolveDisplayName({ userId: "u1", isGm: false, characterId: null, character: null }),
    ).toThrow("Choisis ton personnage pour lancer les dés.");
  });
  it("un joueur avec SON personnage → display_name = handle", () => {
    expect(
      resolveDisplayName({ userId: "u1", isGm: false, characterId: "c1", character: mine }),
    ).toBe("SUDO");
  });
  it("personnage inexistant → erreur", () => {
    expect(() =>
      resolveDisplayName({ userId: "u1", isGm: true, characterId: "cX", character: null }),
    ).toThrow();
  });
});
