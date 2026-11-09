import { describe, expect, it } from "vitest";
import { readStats, type SheetWeapon } from "./sheet";
import {
  applyWeaponHint,
  canDouble,
  canAutofire,
  guessWeapon,
  hintChanges,
  weaponAttack,
  weaponDamage,
} from "./weapon-rules";
import { normalizeUniverse, presetById } from "./universe";

const cp = presetById("cyberpunk");
const fantasy = presetById("fantasy");

const weapon: SheetWeapon = {
  name: "Pistolet",
  dmg: "9d6",
  ammoRaw: "30",
  capacity: 30,
  rof: 1,
  skill: "Pistolets",
  note: "",
};
const stats = readStats({ stats: { REF: 7, DEX: 5, BODY: 8 } }, cp);
describe("weapon rules", () => {
  it("allows Double only at rof >= 2", () => {
    expect(canDouble(weapon)).toBe(false);
    expect(canDouble({ ...weapon, rof: 2 })).toBe(true);
  });
  it("allows auto only for the specified weapon names, not magazine size", () => {
    for (const name of ["Mitraillette légère", "SMG lourde", "Fusil d’assaut"])
      expect(canAutofire({ ...weapon, name }, cp)).toBe(true);
    for (const name of ["Mitraillette légère"])
      expect(canAutofire({ ...weapon, name }, fantasy)).toBe(false);
    expect(canAutofire({ ...weapon, name: "Pistolet", capacity: 50 }, cp)).toBe(false);
  });
  it("uses Autofire and REF instead of the weapon skill", () => {
    const attack = weaponAttack(
      weapon,
      [
        { name: "Pistolets", stat: "REF", level: 6 },
        { name: "Tir automatique (Autofire)", stat: "REF", level: 3 },
      ],
      stats,
      cp,
      true,
    );
    expect(attack.base).toBe(10);
    expect(attack.name).toBe("Tir automatique (Autofire)");
  });
  it("uses REF + 0 when Autofire is absent", () => {
    expect(weaponAttack(weapon, [], stats, cp, true)).toMatchObject({ base: 7, unlearned: true });
  });
  it("uses Brawling and DEX for both unarmed names regardless of JSON skill", () => {
    for (const name of ["Main nue", "Mains nues"]) {
      expect(
        weaponAttack(
          { ...weapon, name },
          [{ name: "Bagarre (Brawling)", stat: "REF", level: 2 }],
          stats,
          cp,
        ),
      ).toMatchObject({ base: 7, stat: "DEX" });
    }
  });
  it("uses JSON dmg for armed weapons", () => {
    expect(weaponDamage(weapon, stats, cp)).toBe("9d6");
  });
  it.each([
    [4, "1d6"],
    [5, "2d6"],
    [6, "2d6"],
    [7, "3d6"],
    [10, "3d6"],
    [11, "4d6"],
  ])("uses BODY %s for unarmed damage, ignoring JSON", (body, damage) => {
    for (const name of ["Main nue", "Mains nues"])
      expect(weaponDamage({ ...weapon, name, dmg: "9d6" }, { CORPS: Number(body) }, cp)).toBe(
        damage,
      );
  });
  it("uses stat + 0 for an absent weapon skill", () => {
    expect(weaponAttack(weapon, [], stats, cp)).toMatchObject({ base: 7, unlearned: true });
    expect(
      weaponAttack({ ...weapon, name: "Couteau", capacity: 0, skill: "Mêlée" }, [], stats, cp),
    ).toMatchObject({ base: 5, unlearned: true });
  });
  it("sans règle de mains nues, les dégâts écrits sur l'arme sont utilisés", () => {
    const neutral = presetById("neutre");
    expect(weaponDamage({ ...weapon, name: "Mains nues", dmg: "1d4" }, {}, neutral)).toBe("1d4");
  });
  it("univers d20 : la base d'attaque suit la formule de l'univers", () => {
    const st = readStats({ stats: { FOR: 16, DEX: 14 } }, fantasy);
    const sword = { ...weapon, name: "Épée longue", capacity: 0, skill: "Épées" };
    expect(
      weaponAttack(sword, [{ name: "Épées", stat: "FOR", level: 2 }], st, fantasy),
    ).toMatchObject({ base: 5, unlearned: false });
    expect(
      weaponAttack({ ...weapon, name: "Arc court", skill: "Arcs" }, [], st, fantasy),
    ).toMatchObject({ base: 2, stat: "DEX", unlearned: true });
  });
});

describe("suggestions d'armes d'après le nom", () => {
  const blank = (name: string): SheetWeapon => ({
    name,
    dmg: "1d6",
    ammoRaw: "",
    capacity: 0,
    rof: 1,
    skill: "",
    note: "",
  });

  it("le mot le plus précis l'emporte, sans accents ni majuscules", () => {
    expect(guessWeapon("Fusil d'assaut Militech", cp)?.hint).toMatchObject({
      skill: "Fusil",
      capacity: 25,
      dmg: "5d6",
    });
    expect(guessWeapon("PISTOLET TRES LOURD", cp)?.hint).toMatchObject({ capacity: 8, dmg: "4d6" });
    expect(guessWeapon("Pistolet", cp)?.hint).toMatchObject({ capacity: 12, dmg: "2d6" });
  });

  it("un mot entier seulement : « arc » ne se trouve pas dans « parc »", () => {
    expect(guessWeapon("Ticket de parc", fantasy)).toBeNull();
    expect(guessWeapon("Arc long elfique", fantasy)?.hint).toMatchObject({
      capacity: 20,
      dmg: "1d8",
    });
  });

  it("chaque préréglage propose ses propres compétences", () => {
    expect(guessWeapon("Revolver", presetById("horreur"))?.hint).toMatchObject({
      skill: "Armes à feu",
      capacity: 6,
    });
    expect(guessWeapon("Arbalète", presetById("grimdark"))?.hint.skill).toBe("Tir");
    expect(guessWeapon("Dague", presetById("neutre"))?.hint).toMatchObject({
      skill: "Bagarre",
      capacity: 0,
    });
    // Toutes les compétences proposées existent dans la bibliothèque du préréglage
    for (const id of ["neutre", "fantasy", "grimdark", "horreur", "cyberpunk"]) {
      const u = presetById(id);
      for (const h of u.rules.weaponHints)
        if (h.skill)
          expect(
            u.rules.skillLibrary.map((s) => s.name),
            `${id} ${h.skill}`,
          ).toContain(h.skill);
    }
  });

  it("appliquer ne change que ce que la suggestion donne", () => {
    const hint = guessWeapon("Katana", cp)!.hint;
    const w = applyWeaponHint({ ...blank("Katana"), capacity: 12, ammoRaw: "12" }, hint);
    expect(w).toMatchObject({ skill: "Mêlée", capacity: 0, ammoRaw: "", dmg: "3d6", rof: 2 });
    expect(hintChanges(w, hint)).toBe(false);
    const fantasyHint = guessWeapon("Dague", fantasy)!.hint;
    expect(applyWeaponHint({ ...blank("Dague"), skill: "Lames" }, fantasyHint).skill).toBe("Lames");
  });

  it("l'univers relit ses suggestions et en borne les valeurs", () => {
    const u = normalizeUniverse({
      ...cp,
      rules: {
        ...cp.rules,
        weaponHints: [
          { words: "canon", skill: "Tir", capacity: 5000, dmg: "8d6", rof: -3 },
          { words: "" },
        ],
      },
    });
    expect(u.rules.weaponHints).toEqual([
      { words: "canon", skill: "Tir", capacity: 999, dmg: "8d6", rof: 0 },
    ]);
  });
});
