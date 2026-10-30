import { describe, expect, it } from "vitest";
import {
  RECIPE_KINDS,
  buildFormula,
  describeFormula,
  newRecipe,
  parseFormula,
  type Recipe,
} from "./formula-builder";
import { checkFormula, evalFormula } from "./formula";
import { PRESETS } from "./universe";

const vars = [
  { code: "CORPS", label: "Corps" },
  { code: "VOL", label: "Volonté" },
  { code: "MAX", label: "PV maximum" },
];
const known = vars.map((v) => v.code);
const parsed = (src: string) => parseFormula(src, known);

describe("parseFormula", () => {
  it("reads the Cyberpunk HP formula as a sentence", () => {
    expect(parsed("10 + 5*ceil((CORPS+VOL)/2)")).toEqual({
      kind: "average",
      base: 10,
      mul: 5,
      round: "ceil",
      a: "CORPS",
      b: "VOL",
    });
  });
  it("reads tiers, fractions and multiples", () => {
    expect(parsed("1 + (CORPS>=5) + (CORPS>=7) + (CORPS>=11)")).toEqual({
      kind: "tiers",
      base: 1,
      a: "CORPS",
      steps: [5, 7, 11],
    });
    expect(parsed("ceil(MAX/2)")).toMatchObject({ kind: "fraction", a: "MAX", div: 2 });
    expect(parsed("CORPS*10")).toEqual({ kind: "one", base: 0, mul: 10, a: "CORPS" });
  });
  it("leaves anything else to the free mode", () => {
    expect(parsed("floor((CORPS-10)/2) + VOL")).toBeNull();
    expect(parsed("1 + (CORPS>=5) + (VOL>=7)")).toBeNull();
    expect(parsed("INCONNU*2")).toBeNull();
  });
  it("treats empty as none", () => expect(parsed("  ")).toEqual({ kind: "none" }));
});

describe("buildFormula", () => {
  it.each(RECIPE_KINDS.map((k) => k.key))("%s is valid and reads back the same", (kind) => {
    const recipe = newRecipe(kind, vars);
    const src = buildFormula(recipe);
    expect(checkFormula(src, known)).toBeNull();
    expect(parseFormula(src, known)).toEqual(recipe);
  });
  it.each([
    [{ kind: "average", base: 10, mul: 5, a: "CORPS", b: "VOL", round: "ceil" } as Recipe, 50],
    [{ kind: "tiers", base: 1, a: "CORPS", steps: [5, 7, 11] } as Recipe, 3],
    [{ kind: "fraction", base: 0, mul: 2, a: "VOL", div: 3, round: "floor" } as Recipe, 4],
  ])("computes as expected", (recipe, expected) => {
    expect(evalFormula(buildFormula(recipe), { CORPS: 8, VOL: 7 })).toBe(expected);
  });
});

describe("existing presets stay exact", () => {
  it.each(
    PRESETS.flatMap((p) =>
      [
        p.universe.rules.hpMax,
        p.universe.rules.woundedAt,
        ...p.universe.rules.gauges.map((g) => g.max),
      ]
        .filter(Boolean)
        .map((f) => [p.id, f, p.universe] as const),
    ),
  )("%s : %s", (_, formula, u) => {
    const codes = [...u.rules.stats.map((s) => s.key), "MAX"];
    const recipe = parseFormula(formula, codes);
    if (!recipe) return; // Reste en mode libre, intact
    const sample = Object.fromEntries(codes.map((c, i) => [c, 11 + i * 3]));
    expect(evalFormula(buildFormula(recipe), sample)).toBe(evalFormula(formula, sample));
  });
});

describe("describeFormula", () => {
  it("speaks French with display names", () => {
    expect(describeFormula("10 + 5*ceil((CORPS+VOL)/2)", vars)).toBe(
      "10 + 5 × moyenne de Corps et Volonté, arrondie au-dessus",
    );
    expect(describeFormula("20", vars)).toBe("Toujours 20");
    expect(describeFormula("", vars, "Saisi à la main")).toBe("Saisi à la main");
    expect(describeFormula("floor((CORPS-10)/2) + VOL", vars)).toBe(
      "arrondi en dessous((Corps-10) ÷ 2) + Volonté",
    );
  });
});
