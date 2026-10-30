import { describe, expect, it } from "vitest";
import { buildAmmo, parseInventory, rowsToSheet, sheetToRows } from "./character-import";

describe("character import", () => {
  it("leading number is the quantity", () => {
    expect(parseInventory("42 point compétence\nAgent")).toEqual([
      { qty: 42, name: "point compétence" },
      { qty: 1, name: "Agent" },
    ]);
  });
  it("ammo only for weapons with ammo > 0, key = weapon position, spare 2, loose 0", () => {
    expect(
      buildAmmo({
        weapons: [
          { name: "Pistolet", ammo: 12 },
          { name: "Lame", ammo: 0 },
          { name: "Fusil", ammo: " 25 " },
        ],
      }),
    ).toEqual({
      "0": { mag: 12, spare: 2, loose: 0 },
      "2": { mag: 25, spare: 2, loose: 0 },
    });
  });
  it("hp and eddies come from the JSON", () => {
    const r = sheetToRows({ name: "V", hpCurrent: 35, eddies: 500 });
    expect(r.state.hp_current).toBe(35);
    expect(r.state.eddies).toBe(500);
  });
  it("export replaces hpCurrent, eddies, inventory with current state", () => {
    const out = rowsToSheet(
      { name: "V", hpCurrent: 35, eddies: 500, inventory: "x", other: 1 },
      {
        hp_current: 10,
        eddies: 20,
        inventory: [{ qty: 3, name: "Grenade" }],
      },
    );
    expect(out).toEqual({ name: "V", hpCurrent: 10, eddies: 20, inventory: "3 Grenade", other: 1 });
  });
});
