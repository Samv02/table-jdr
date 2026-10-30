import { presetById } from "./universe";
const cp = presetById("cyberpunk");
import { describe, it, expect } from "vitest";
import { dashboardAlerts, hudParty, loginDestination, type DashboardRow } from "./dashboard";
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
  });
});
