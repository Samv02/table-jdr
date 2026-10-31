import { describe, expect, it } from "vitest";
import {
  applyEffects,
  describeEffects,
  effectTargets,
  itemErrors,
  parseItemDie,
  readItemData,
  EMPTY_DATA,
} from "./catalog";
import { PRESETS, presetById, normalizeUniverse, EMPTY_TEMPLATE } from "./universe";
import { readStats } from "./sheet";

const stat = (u: ReturnType<typeof presetById>) => u.rules.stats[0]?.key ?? "";

describe("readItemData", () => {
  it("survives incomplete or hostile data", () => {
    expect(readItemData(null)).toEqual(EMPTY_DATA);
    const d = readItemData({ slots: 99, effects: [{ target: "hp", amount: "x" }, { amount: 1 }] });
    expect(d.slots).toBe(10);
    expect(d.effects).toEqual([{ target: "hp", amount: 0, useDie: false }]);
  });
});

describe.each(PRESETS.map((p) => [p.id, p.universe] as const))("effets — %s", (_, u) => {
  it("offers every stat of the universe as a target", () => {
    const keys = effectTargets(u).map((t) => t.key);
    expect(keys).toContain("hp");
    for (const s of u.rules.stats) expect(keys).toContain(`stat:${s.key}`);
  });
  it("applies a stat change", () => {
    const key = stat(u);
    const r = applyEffects(
      { hp: 1, money: 0, sheet: { stats: { [key]: 5 } } },
      [{ target: `stat:${key}`, amount: 2, useDie: false }],
      null,
      u,
    );
    expect(readStats(r.sheet, u)[key]).toBe(7);
  });
});

describe("applyEffects", () => {
  const u = presetById("cyberpunk");
  const sheet = {
    stats: Object.fromEntries(u.rules.stats.map((s) => [s.key, 6])),
  };

  it("never lets HP go above the maximum nor below zero", () => {
    const heal = applyEffects(
      { hp: 5, money: 0, sheet },
      [{ target: "hp", amount: 9999, useDie: false }],
      null,
      u,
    );
    expect(heal.hp).toBeGreaterThan(5);
    expect(heal.hp).toBeLessThan(9999);
    const hurt = applyEffects(
      { hp: 5, money: 0, sheet },
      [{ target: "hp", amount: -50, useDie: false }],
      null,
      u,
    );
    expect(hurt.hp).toBe(0);
  });
  it("uses the die, with its sign", () => {
    const plus = applyEffects(
      { hp: 5, money: 0, sheet },
      [{ target: "hp", amount: 1, useDie: true }],
      4,
      u,
    );
    expect(plus.hp).toBe(9);
    const minus = applyEffects(
      { hp: 5, money: 0, sheet },
      [{ target: "hp", amount: -1, useDie: true }],
      4,
      u,
    );
    expect(minus.hp).toBe(1);
  });
  it("does not wipe HP when the maximum is unknown", () => {
    const horror = presetById("horreur");
    const r = applyEffects(
      { hp: 16, money: 0, sheet: { stats: {} } },
      [{ target: "hp", amount: 2, useDie: false }],
      null,
      horror,
    );
    expect(r.hp).toBe(18);
  });
  it("does not wipe a gauge when its maximum is unknown", () => {
    const u = presetById("cyberpunk");
    const gauge = { key: "focus", label: "Focus", color: "cyan", max: "" };
    const r = applyEffects(
      { hp: 10, money: 0, sheet: { focus: 6 } },
      [{ target: "gauge:focus", amount: 2, useDie: false }],
      null,
      { ...u, rules: { ...u.rules, gauges: [gauge] } } as typeof u,
    );
    expect(r.sheet["focus"]).toBe(8);
  });
  it("keeps money positive", () => {
    const r = applyEffects(
      { hp: 1, money: 3, sheet },
      [{ target: "money", amount: -10, useDie: false }],
      null,
      u,
    );
    expect(r.money).toBe(0);
  });
  it("ignores a target removed from the universe", () => {
    const r = applyEffects(
      { hp: 1, money: 0, sheet },
      [{ target: "stat:INCONNU", amount: 3, useDie: false }],
      null,
      u,
    );
    expect(r.lines).toEqual([]);
  });
});

describe("validation", () => {
  it("reads dice", () => {
    expect(parseItemDie("2d6+1")).toMatchObject({ count: 2, sides: 6, mod: 1 });
    expect(parseItemDie("abc")).toBeNull();
    expect(parseItemDie("99d6")).toBeNull();
  });
  it("refuses an effect using a missing die", () => {
    expect(itemErrors("", EMPTY_DATA)).toBeTruthy();
    const data = { ...EMPTY_DATA, effects: [{ target: "hp", amount: 1, useDie: true }] };
    expect(itemErrors("Potion", data)).toMatch(/dé/);
    expect(itemErrors("Potion", { ...data, die: "2d4" })).toBeNull();
  });
  it("describes effects with universe words", () => {
    const u = presetById("cyberpunk");
    const text = describeEffects(
      { ...EMPTY_DATA, die: "2d4", effects: [{ target: "hp", amount: 1, useDie: true }] },
      u,
    );
    expect(text).toBe(`${u.words.hp} +2d4`);
  });
});

describe("template", () => {
  it("defaults to empty and cleans what it reads", () => {
    expect(normalizeUniverse({}).template).toEqual(EMPTY_TEMPLATE);
    const t = normalizeUniverse({
      template: {
        money: -5,
        slots: 99,
        skills: [{ name: "Tir", stat: "REF", level: 3 }, { name: 1 }],
      },
    }).template;
    expect(t.money).toBe(0);
    expect(t.slots).toBe(20);
    expect(t.skills).toEqual([{ name: "Tir", stat: "REF", level: 3 }]);
  });
});
