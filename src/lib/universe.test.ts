import { describe, expect, it } from "vitest";
import { checkFormula, evalFormula, varKey } from "./formula";
import {
  PRESETS,
  gaugeMax,
  hpMaxFor,
  isCritical,
  isFumble,
  normalizeUniverse,
  presetById,
  rollDegrees,
  rollSuccess,
  skillBaseFor,
  skillRoll,
  skillRollLabel,
  unarmedDamage,
  universeErrors,
  woundedFor,
  deathSaveFor,
} from "./universe";

describe("formules", () => {
  it("calcule les PV de Cyberpunk RED", () => {
    expect(evalFormula("10 + 5*ceil((CORPS+VOL)/2)", { CORPS: 9, VOL: 5 })).toBe(45);
    expect(evalFormula("10 + 5*ceil((CORPS+VOL)/2)", { CORPS: 6, VOL: 7 })).toBe(45);
  });
  it("gère priorités, fonctions, comparaisons et signes", () => {
    expect(evalFormula("2 + 3 * 4", {})).toBe(14);
    expect(evalFormula("-(2+3)", {})).toBe(-5);
    expect(evalFormula("floor((STAT-10)/2) + NIV", { STAT: 15, NIV: 3 })).toBe(5);
    expect(evalFormula("floor((STAT-10)/2)", { STAT: 7 })).toBe(-2);
    expect(evalFormula("max(1, min(4, x))", { X: 9 })).toBe(4);
    expect(evalFormula("1 + (CORPS>=5) + (CORPS>=7) + (CORPS>=11)", { CORPS: 9 })).toBe(3);
    expect(evalFormula("1 + (CORPS>=5) + (CORPS>=7) + (CORPS>=11)", { CORPS: 4 })).toBe(1);
    expect(evalFormula("EMP × 10", { EMP: 4 })).toBe(40);
  });
  it("accents et minuscules dans les noms", () => {
    expect(varKey("Volonté")).toBe("VOLONTE");
    expect(evalFormula("volonté*2", { VOLONTE: 3 })).toBe(6);
  });
  it("ne plante jamais : formule vide ou cassée → valeur de secours", () => {
    expect(evalFormula("", {}, 7)).toBe(7);
    expect(evalFormula("2 +", {}, 7)).toBe(7);
    expect(evalFormula("alert(1)", {}, 7)).toBe(7);
    expect(evalFormula("1/0", {})).toBe(0);
  });
  it("explique les erreurs en français", () => {
    expect(checkFormula("10 + CORPS", ["CORPS"])).toBeNull();
    expect(checkFormula("10 + BODY", ["CORPS"])).toMatch(/inconnu.*BODY/);
    expect(checkFormula("10 + (CORPS", ["CORPS"])).toMatch(/parenth|incompl/);
    expect(checkFormula("10 ; drop", ["CORPS"])).toMatch(/interdit/);
    expect(checkFormula("sqrt(4)", [])).toMatch(/Fonction inconnue/);
  });
});

describe("préréglages", () => {
  it("chaque préréglage est valide et stable après relecture", () => {
    for (const p of PRESETS) {
      expect(universeErrors(p.universe)).toEqual({});
      expect(normalizeUniverse(JSON.parse(JSON.stringify(p.universe)))).toEqual(p.universe);
    }
  });
  it("Cyberpunk : mêmes résultats que l'ancienne appli", () => {
    const u = presetById("cyberpunk");
    const stats = { CORPS: 9, VOL: 5, EMP: 4, CHANCE: 2, REF: 2 };
    expect(hpMaxFor(u, stats, {})).toBe(45);
    expect(woundedFor(u, 45, stats, {})).toBe(23);
    expect(deathSaveFor(u, stats, {})).toBe(9);
    expect(gaugeMax(u, u.rules.gauges[0]!, stats, {})).toBe(40);
    expect(skillBaseFor(u, 2, 6, stats)).toBe(8);
    expect(skillRollLabel(u, 8)).toBe("1d10+8");
    expect(skillRoll(u, 8)).toEqual({ count: 1, sides: 10, mod: 8, target: null });
    expect(unarmedDamage(u, stats)).toBe("3d6");
    expect(unarmedDamage(u, { CORPS: 4 })).toBe("1d6");
  });
  it("Fantasy : modificateur d20", () => {
    const u = presetById("fantasy");
    expect(skillBaseFor(u, 16, 2, {})).toBe(5);
    expect(skillRollLabel(u, -1)).toBe("1d20−1");
    expect(hpMaxFor(u, { CON: 14 }, {})).toBe(14);
  });
  it("Grimdark : jet de pourcentage sous la base", () => {
    const u = presetById("grimdark");
    expect(skillRoll(u, 45)).toEqual({ count: 1, sides: 100, mod: 0, target: 45 });
    expect(skillRollLabel(u, 45)).toBe("1d100 ≤ 45");
    expect(hpMaxFor(u, { F: 34, E: 41, FM: 29 }, {})).toBe(3 + 8 + 2);
    // Destin : maximum saisi par le MJ
    expect(gaugeMax(u, u.rules.gauges[0]!, {}, { fateCurrentMax: 3 })).toBe(3);
  });
  it("PV saisis à la main quand la formule est vide", () => {
    const u = normalizeUniverse({ preset: "neutre", rules: { hpMax: "" } });
    expect(hpMaxFor(u, {}, { hpMax: 31 })).toBe(31);
  });
  it("les champs numériques d'identité servent dans les formules", () => {
    const u = normalizeUniverse({ preset: "neutre", rules: { hpMax: "8*LEVEL" } });
    expect(hpMaxFor(u, {}, { level: "3" })).toBe(24);
  });
});

describe("critiques", () => {
  const cp = presetById("cyberpunk");
  const gd = presetById("grimdark");
  const hr = presetById("horreur");
  const r = (sides: number, v: number, target: number | null = null) => ({
    dice_count: 1,
    dice_sides: sides,
    results: [v],
    total: v,
    target,
  });
  it("d10 : 10 critique, 1 échec critique, autres dés ignorés", () => {
    expect(isCritical(cp, r(10, 10))).toBe(true);
    expect(isFumble(cp, r(10, 1))).toBe(true);
    expect(isCritical(cp, r(6, 6))).toBe(false);
    expect(isCritical(cp, { ...r(10, 10), dice_count: 2, results: [10, 10] })).toBe(false);
  });
  it("d100 sous la base : doubles réussis = critique, doubles ratés = maladresse", () => {
    expect(rollSuccess(r(100, 33, 45))).toBe(true);
    expect(isCritical(gd, r(100, 33, 45))).toBe(true);
    expect(isFumble(gd, r(100, 33, 45))).toBe(false);
    expect(isFumble(gd, r(100, 77, 45))).toBe(true);
    expect(isCritical(gd, r(100, 34, 45))).toBe(false);
    expect(rollDegrees(r(100, 12, 45))).toBe(3);
    expect(rollDegrees(r(100, 71, 45))).toBe(-3);
  });
  it("horreur : 01 critique, 100 maladresse", () => {
    expect(isCritical(hr, r(100, 1, 40))).toBe(true);
    expect(isFumble(hr, r(100, 100, 40))).toBe(true);
    expect(isCritical(hr, r(100, 1, 0))).toBe(false); // raté quand même
  });
});

describe("relecture tolérante", () => {
  it("valeurs absurdes remplacées par celles du préréglage", () => {
    const u = normalizeUniverse({
      preset: "fantasy",
      theme: { cyan: "red", corners: "triangle", glow: "oui" },
      rules: { skillDice: { count: 99, sides: 1 }, stats: "FOR" },
      words: { money: "x".repeat(500) },
    });
    const f = presetById("fantasy");
    expect(u.theme.cyan).toBe(f.theme.cyan);
    expect(u.theme.corners).toBe(f.theme.corners);
    expect(u.rules.skillDice).toEqual({ count: 10, sides: 2 });
    expect(u.rules.stats).toEqual(f.rules.stats);
    expect(u.words.money).toBe(f.words.money);
  });
  it("rien du tout → univers neutre", () => {
    expect(normalizeUniverse(null).preset).toBe("neutre");
  });
});

describe("skill library", () => {
  it.each(PRESETS.map((p) => [p.id, p.universe] as const))(
    "%s links skills to real stats",
    (_, u) => {
      const keys = u.rules.stats.map((s) => s.key);
      expect(u.rules.skillLibrary.length).toBeGreaterThan(5);
      for (const s of u.rules.skillLibrary) expect(keys).toContain(s.stat);
      expect(universeErrors(u)["skillLibrary"]).toBeUndefined();
    },
  );
  it("gives existing tables their preset list, and keeps a custom one", () => {
    expect(normalizeUniverse({ preset: "horreur" }).rules.skillLibrary.length).toBeGreaterThan(5);
    const own = [{ name: "Pêche", stat: "INT", level: 2 }];
    const u = normalizeUniverse({ preset: "horreur", rules: { skillLibrary: own } });
    expect(u.rules.skillLibrary).toEqual(own);
    expect(normalizeUniverse({ rules: { skillLibrary: [] } }).rules.skillLibrary).toEqual([]);
  });
  it("flags a skill whose stat no longer exists", () => {
    const u = normalizeUniverse({ preset: "horreur" });
    const broken = {
      ...u,
      rules: { ...u.rules, skillLibrary: [{ name: "X", stat: "NON", level: 0 }] },
    };
    expect(universeErrors(broken)["skillLibrary"]).toBeTruthy();
  });
});
