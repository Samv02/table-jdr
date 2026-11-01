import { describe, expect, it } from "vitest";
import { hpMax, hpShown, readSkills, readStats, readWeapons } from "@/lib/sheet";
import { PRESETS } from "@/lib/universe";
import {
  previewFromRows,
  sampleCharacter,
  sampleStat,
  statColumns,
  topStatKeys,
} from "@/lib/universe-preview";

describe("sampleCharacter", () => {
  it.each(PRESETS.map((p) => [p.label, p.universe] as const))(
    "builds a readable sheet for %s",
    (_, u) => {
      const c = sampleCharacter(u);
      const stats = readStats(c.sheet, u);
      expect(Object.keys(stats)).toEqual(u.rules.stats.map((s) => s.key));
      expect(Object.values(stats).every((v) => v === sampleStat(u))).toBe(true);
      expect(readSkills(c.sheet).length).toBeGreaterThan(0);
      expect(readWeapons(c.sheet)).toHaveLength(1);
      const max = hpMax(stats, c.sheet, u);
      expect(max).toBeGreaterThan(0);
      expect(hpShown(c.hp_current, max)).toBe(c.hp_current);
    },
  );

  it("uses the universe's starting sheet when it has one", () => {
    const u = structuredClone(PRESETS[0]!.universe);
    const first = u.rules.stats[0]!;
    u.template = {
      ...u.template,
      stats: { [first.key]: 9 },
      money: 77,
      skills: [{ name: "Pêche", stat: first.key, level: 2 }],
    };
    const c = sampleCharacter(u);
    expect(readStats(c.sheet, u)[first.key]).toBe(9);
    expect(c.eddies).toBe(77);
    expect(readSkills(c.sheet).map((s) => s.name)).toEqual(["Pêche"]);
  });
});

describe("previewFromRows", () => {
  it("keeps an empty state readable", () => {
    const c = previewFromRows({ id: "1", name: "Alex", handle: null, sheet: {} }, undefined);
    expect(c).toMatchObject({ hp_current: 0, eddies: 0, inventory: [], programs: [] });
  });
});

describe("stat layout", () => {
  it("never leaves an orphan tile", () => {
    expect([6, 8, 10].map(statColumns)).toEqual([3, 4, 5]);
  });
  it("highlights the three best stats only with enough values", () => {
    expect(topStatKeys({ A: 1, B: 2, C: 3 }).size).toBe(0);
    expect([...topStatKeys({ A: 1, B: 2, C: 3, D: 4 })].sort()).toEqual(["B", "C", "D"]);
  });
});
