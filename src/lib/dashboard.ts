import type { AmmoEntry, InventoryItem } from "./character-import";
import { hpMax, hpStatus, readStats, readWeapons, type Sheet } from "./sheet";
import { woundedFor, type Universe } from "./universe";
import type { PartyMember } from "./table-context";

export type DashboardState = {
  hp_current: number;
  eddies: number;
  ammo: Record<string, AmmoEntry>;
  inventory: InventoryItem[];
};
export type DashboardRow = {
  id: string;
  name: string;
  handle: string | null;
  sheet: Sheet;
  players_can_edit: boolean;
  character_state: DashboardState | null;
};
export const loginDestination = (isGm: boolean) =>
  isGm ? ("/mj/tableau" as const) : ("/fiche" as const);
export function hudParty(party: PartyMember[]): PartyMember[] {
  const gm = party.find((p) => p.character_id === "mj");
  return [
    ...party.filter((p) => p.character_id !== "mj"),
    gm ?? { character_id: "mj", handle: "MJ", avatar_url: null, color: "cyan" },
  ];
}
export function dashboardAlerts(row: DashboardRow, u: Universe) {
  const state = row.character_state;
  const stats = readStats(row.sheet, u);
  const max = hpMax(stats, row.sheet, u);
  const health = state
    ? hpStatus(state.hp_current, woundedFor(u, max, stats, row.sheet)) !== "ok"
    : false;
  const ammo =
    u.modules.ammo && state
      ? readWeapons(row.sheet).some((w, i) => {
          const a = state.ammo[String(i)];
          return w.capacity > 0 && !!a && (a.mag <= w.capacity / 3 || a.spare <= 0);
        })
      : false;
  return { health, ammo };
}
