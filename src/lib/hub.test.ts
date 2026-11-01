import { describe, expect, it } from "vitest";
import {
  greeting,
  hubTable,
  inviteLink,
  sessionLabel,
  setupSteps,
  sinceLabel,
  soonestTable,
  roleLabel,
  sortTables,
  type HubRow,
} from "./hub";
import { activeTab, GM_TABS } from "./navigation";

const now = new Date(2026, 9, 31, 12, 0);
const row: HubRow = {
  id: "t",
  name: "Table",
  role: "player",
  members: 3,
  sheets: 2,
  characters: ["Alex"],
  party: [],
  universe: { preset: "horreur" },
  scene: null,
  last_opened_at: "2026-10-30T10:00:00.000Z",
  last_activity: "2026-10-30T12:00:00.000Z",
  next_session: null,
  is_owner: false,
  my_avatar: null,
};

describe("hub", () => {
  it("reads each table with its own universe", () => {
    expect(hubTable(row).universe.preset).toBe("horreur");
    expect(hubTable({ ...row, universe: {} }).universe.preset).toBe("neutre");
  });
  it("flags only what happened since the last visit", () => {
    expect(hubTable(row).isNew).toBe(true);
    expect(hubTable({ ...row, last_activity: "2026-10-29T12:00:00.000Z" }).isNew).toBe(false);
    expect(hubTable({ ...row, last_opened_at: null }).isNew).toBe(false);
  });
  it("counts calendar days", () => {
    expect(sinceLabel(new Date(2026, 9, 31, 1).toISOString(), now)).toBe("aujourd’hui");
    expect(sinceLabel(new Date(2026, 9, 30, 23).toISOString(), now)).toBe("hier");
    expect(sinceLabel(new Date(2026, 9, 28).toISOString(), now)).toBe("il y a 3 jours");
  });
  it("never shows a session already over", () => {
    expect(sessionLabel(null, now)).toBeNull();
    expect(sessionLabel(new Date(2026, 9, 30).toISOString(), now)).toBeNull();
    expect(sessionLabel(new Date(2026, 9, 31, 20, 30).toISOString(), now)).toBe(
      "aujourd’hui à 20:30",
    );
    expect(sessionLabel(new Date(2026, 10, 1, 20, 30).toISOString(), now)).toBe("demain à 20:30");
  });
  it("greets according to the hour", () => {
    expect(greeting(9)).toBe("Bonjour");
    expect(greeting(21)).toBe("Bonsoir");
    expect(greeting(2)).toBe("Bonsoir");
  });
  it("picks the closest session still to come", () => {
    const at = (d: number) => new Date(2026, 10, d, 20).toISOString();
    const list = [
      { next_session: at(9) },
      { next_session: new Date(2026, 9, 1).toISOString() },
      { next_session: at(3) },
      { next_session: null },
    ];
    expect(soonestTable(list, now)?.next_session).toBe(at(3));
    expect(soonestTable([{ next_session: null }], now)).toBeNull();
  });
  it("builds an invitation link", () => {
    expect(inviteLink("AB CD", "https://x.fr")).toBe("https://x.fr/rejoindre?code=AB%20CD");
  });
  it("derives the first steps from the data", () => {
    const fresh = {
      preset: "neutre",
      tableNamed: false,
      sheets: 0,
      players: 0,
      assigned: 0,
      scene: false,
    };
    expect(setupSteps(fresh).every((s) => !s.done)).toBe(true);
    const ready = {
      preset: "horreur",
      tableNamed: false,
      sheets: 2,
      players: 2,
      assigned: 2,
      scene: true,
    };
    expect(setupSteps(ready).every((s) => s.done)).toBe(true);
    expect(setupSteps({ ...ready, assigned: 1 }).find((s) => s.key === "attribuer")?.done).toBe(
      false,
    );
  });
});

describe("navigation", () => {
  it("lights Personnages when the GM reads a sheet, not for a player", () => {
    expect(activeTab("/fiche", true)).toBe("/mj/personnages");
    expect(activeTab("/fiche", false)).toBe("/fiche");
  });
  it("never lists a page twice", () => {
    const all = GM_TABS.flat().map((t) => t.to);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("sortTables", () => {
  const owner = { name: "Zèbre", role: "gm", is_owner: true, next_session: null };
  const gm = {
    name: "Écume",
    role: "gm",
    is_owner: false,
    next_session: "2026-11-02T20:00:00.000Z",
  };
  const player = {
    name: "Alpha",
    role: "player",
    is_owner: false,
    next_session: "2026-11-01T20:00:00.000Z",
  };
  const list = [player, gm, owner];
  const now = new Date("2026-10-31T12:00:00.000Z");

  it("keeps the database order for recent", () => {
    expect(sortTables(list, "recent", now)).toEqual(list);
  });
  it("puts owned tables first, then the ones the account runs", () => {
    expect(sortTables(list, "mine", now)).toEqual([owner, gm, player]);
  });
  it("sorts names the French way", () => {
    expect(sortTables(list, "name", now).map((t) => t.name)).toEqual(["Alpha", "Écume", "Zèbre"]);
  });
  it("puts the next session first and tables without a date last", () => {
    expect(sortTables(list, "session", now)).toEqual([player, gm, owner]);
  });
  it("ignores a past session", () => {
    const past = { ...gm, next_session: "2026-10-01T20:00:00.000Z" };
    expect(sortTables([past, player], "session", now)).toEqual([player, past]);
  });
  it("does not change the list it receives", () => {
    sortTables(list, "name", now);
    expect(list).toEqual([player, gm, owner]);
  });
});

describe("roleLabel", () => {
  it("says what the account is at this table", () => {
    expect(roleLabel({ role: "gm", is_owner: true })).toBe("MJ · Propriétaire");
    expect(roleLabel({ role: "gm", is_owner: false })).toBe("MJ");
    expect(roleLabel({ role: "player", is_owner: true })).toBe("Joueur · Propriétaire");
    expect(roleLabel({ role: "player", is_owner: false })).toBe("Joueur");
  });
});
