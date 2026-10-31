import { describe, expect, it } from "vitest";
import { hubTable, inviteLink, sessionLabel, setupSteps, sinceLabel, type HubRow } from "./hub";
import { activeTab, GM_TABS } from "./navigation";

const now = new Date(2026, 9, 31, 12, 0);
const row: HubRow = {
  id: "t",
  name: "Table",
  role: "player",
  members: 3,
  sheets: 2,
  characters: ["Alex"],
  universe: { preset: "horreur" },
  scene: null,
  last_opened_at: "2026-10-30T10:00:00.000Z",
  last_activity: "2026-10-30T12:00:00.000Z",
  next_session: null,
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
