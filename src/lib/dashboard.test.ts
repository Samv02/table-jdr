import {
  DEFAULT_PREFS,
  LAYOUT_PRESETS,
  applyLayout,
  applyQuickView,
  arrangeRows,
  isLayout,
  isQuickView,
  isSavedView,
  snapshotView,
  dropCharacter,
  dropSection,
  moveCharacter,
  moveSection,
  readPrefs,
  type DashboardPrefs,
} from "./dashboard";
import { presetById } from "./universe";
import { describe, it, expect } from "vitest";
import { dashboardAlerts, hudParty, loginDestination, type DashboardRow } from "./dashboard";
const cp = presetById("cyberpunk");
const row: DashboardRow = {
  id: "a",
  name: "A",
  handle: null,
  players_can_edit: false,
  sheet: { stats: { BODY: 8, WILL: 6 }, weapons: [{ name: "P", ammo: 30 }] },
  character_state: {
    hp_current: 45,
    eddies: 0,
    ammo: { "0": { mag: 11, spare: 1, loose: 0 } },
    inventory: [],
  },
};
describe("MJ dashboard rules", () => {
  it("sends GM to dashboard and players to sheet", () => {
    expect(loginDestination(true)).toBe("/mj/tableau");
    expect(loginDestination(false)).toBe("/fiche");
  });
  it("shows GM exactly once and last", () => {
    const mj = { character_id: "mj", handle: "MJ", avatar_url: null, color: "cyan" };
    expect(hudParty([mj, { ...mj, character_id: "a" }, mj]).map((p) => p.character_id)).toEqual([
      "a",
      "mj",
    ]);
  });
  it("warns at half HP rounded up and at zero", () => {
    for (const hp of [23, 0])
      expect(
        dashboardAlerts(
          {
            ...row,
            character_state: {
              ...(row.character_state as NonNullable<DashboardRow["character_state"]>),
              hp_current: hp,
            },
          },
          cp,
        ).health,
      ).toBe(true);
    expect(dashboardAlerts(row, cp).health).toBe(false);
  });
  it("warns at one third magazine or zero spare magazines", () => {
    for (const a of [
      { mag: 10, spare: 1, loose: 0 },
      { mag: 30, spare: 0, loose: 0 },
    ])
      expect(
        dashboardAlerts(
          {
            ...row,
            character_state: {
              ...(row.character_state as NonNullable<DashboardRow["character_state"]>),
              ammo: { "0": a },
            },
          },
          cp,
        ).ammo,
      ).toBe(true);
    expect(dashboardAlerts(row, cp).ammo).toBe(false);
    expect(
      dashboardAlerts(
        {
          ...row,
          character_state: {
            ...(row.character_state as NonNullable<DashboardRow["character_state"]>),
            ammo: { "0": { mag: 0, spare: 0, loose: 0 } },
          },
        },
        { ...cp, modules: { ...cp.modules, ammo: false } },
      ).ammo,
    ).toBe(false);
  });
});

describe("dashboard layout", () => {
  const row = (id: string, name: string, hp: number, eddies = 0) =>
    ({
      id,
      name,
      handle: null,
      sheet: { hpMax: 20 },
      players_can_edit: false,
      character_state: { hp_current: hp, eddies, ammo: {}, inventory: [] },
    }) as DashboardRow;
  const u = presetById("neutre");
  const list = [row("a", "Zed", 20, 5), row("b", "Alex", 5, 50), row("c", "Mia", 10, 1)];
  const ids = (prefs: Partial<DashboardPrefs>) =>
    arrangeRows(list, { ...DEFAULT_PREFS, ...prefs }, { isOnline: (id) => id === "a", u }).map(
      (r) => r.id,
    );

  it("keeps the GM's order, new characters last", () =>
    expect(ids({ order: ["c", "a"] })).toEqual(["c", "a", "b"]));
  it("sorts by name, money and injuries", () => {
    expect(ids({ sort: "name" })).toEqual(["b", "c", "a"]);
    expect(ids({ sort: "money" })).toEqual(["b", "a", "c"]);
  });
  it("filters hidden, online and characters", () => {
    expect(ids({ hiddenCharacters: ["b"] })).toEqual(["a", "c"]);
    expect(ids({ onlineOnly: true })).toEqual(["a"]);
  });
  it("moves a character and stays in bounds", () => {
    expect(moveCharacter([], ["a", "b", "c"], "c", -1)).toEqual(["a", "c", "b"]);
    expect(moveCharacter([], ["a", "b"], "a", -1)).toEqual(["a", "b"]);
  });
  it("drops a character or a section onto another", () => {
    expect(dropCharacter([], ["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
    expect(dropCharacter([], ["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
    expect(dropCharacter([], ["a", "b"], "a", "zzz")).toEqual(["a", "b"]);
    const moved = dropSection(DEFAULT_PREFS.sections, "Sac", "Vitaux").map((s) => s.key);
    expect(moved[0]).toBe("Sac");
    expect(moved).toHaveLength(5);
  });
  it("refuses an unknown grid size", () => {
    expect(readPrefs({ columns: 5, spans: { a: 9, b: 2 }, density: "x" })).toMatchObject({
      density: "comfort",
      columns: 0,
      spans: { b: 2 },
    });
    expect(readPrefs({ columns: 6 }).columns).toBe(6);
  });
  it("recognises the layout on screen", () => {
    const focus = LAYOUT_PRESETS.find((p) => p.key === "focus");
    if (!focus) throw new Error("preset");
    const next = { ...DEFAULT_PREFS, ...applyLayout(DEFAULT_PREFS, focus, ["a", "b"]) };
    expect(next.columns).toBe(3);
    expect(next.spans).toEqual({ a: 2 });
    expect(isLayout(next, focus, ["a", "b"])).toBe(true);
    expect(isLayout(next, focus, ["b", "a"])).toBe(false);
    expect(isLayout(DEFAULT_PREFS, focus, ["a", "b"])).toBe(false);
  });
  it("switches quick views without touching the order", () => {
    const moved = { ...DEFAULT_PREFS, sections: moveSection(DEFAULT_PREFS.sections, "Sac", -1) };
    const combat = applyQuickView(moved, ["Vitaux", "Combat"]);
    expect(combat.sections.map((s) => s.key)).toEqual(moved.sections.map((s) => s.key));
    expect(combat.sections.filter((s) => s.visible).map((s) => s.key)).toEqual([
      "Vitaux",
      "Combat",
    ]);
    expect(isQuickView(combat, ["Vitaux", "Combat"])).toBe(true);
    expect(isQuickView(combat, ["Sac"])).toBe(false);
  });
  it("saves a view and recognises it", () => {
    const prefs = { ...DEFAULT_PREFS, columns: 3, hiddenStats: ["INT"] };
    const view = { id: "v", name: "Ma vue", snapshot: snapshotView(prefs) };
    expect(isSavedView(prefs, view)).toBe(true);
    expect(isSavedView({ ...prefs, onlineOnly: true }, view)).toBe(true);
    expect(isSavedView({ ...prefs, columns: 2 }, view)).toBe(false);
    expect(readPrefs({ views: [view, { name: "x" }] }).views).toEqual([view]);
  });
  it("moves a section", () => {
    const moved = moveSection(DEFAULT_PREFS.sections, "Stats", -1).map((s) => s.key);
    expect(moved.slice(0, 2)).toEqual(["Stats", "Vitaux"]);
  });
  it("reads damaged prefs and adds missing sections", () => {
    const prefs = readPrefs({
      sort: "nimp",
      sections: [{ key: "Sac", visible: false }, { key: "x" }],
    });
    expect(prefs.sort).toBe("manual");
    expect(prefs.sections[0]).toEqual({ key: "Sac", visible: false });
    expect(prefs.sections).toHaveLength(5);
    expect(readPrefs(null)).toEqual(DEFAULT_PREFS);
  });
});
