import { describe, expect, it } from "vitest";
import { filterAccounts, filterEvents, type AccountFilter, type EventFilter } from "./admin";
import { needsTeam } from "./team";
import type { AdminAccount, AdminEvent } from "./admin.functions";

const account = (over: Partial<AdminAccount>): AdminAccount => ({
  id: "1",
  email: "a@b.fr",
  username: "Alex",
  created_at: "",
  last_sign_in_at: null,
  suspended: false,
  admin: false,
  teams: [],
  ...over,
});

describe("filterAccounts", () => {
  const list = [
    account({ id: "1" }),
    account({ id: "2", username: null, email: "zoe@x.fr" }),
    account({ id: "3", username: "Sam", teams: [{ id: "t", name: "Les Corbeaux", role: "gm" }] }),
  ];
  const ids = (q: string) => filterAccounts(list, q).map((a) => a.id);
  it("keeps everything without a search", () => expect(ids("  ")).toEqual(["1", "2", "3"]));
  it("searches pseudo, e-mail and team, ignoring case", () => {
    expect(ids("ALEX")).toEqual(["1"]);
    expect(ids("zoe@")).toEqual(["2"]);
    expect(ids("corbeaux")).toEqual(["3"]);
  });
});

describe("filterAccounts filters", () => {
  const list = [
    account({ id: "1", teams: [{ id: "t", name: "E", role: "player" }] }),
    account({ id: "2", suspended: true }),
    account({ id: "3", admin: true }),
  ];
  const ids = (f: AccountFilter) => filterAccounts(list, "", f).map((a) => a.id);
  it("narrows by state", () => {
    expect(ids("suspended")).toEqual(["2"]);
    expect(ids("admin")).toEqual(["3"]);
  });
  it("does not count admins as accounts without a team", () =>
    expect(ids("noTeam")).toEqual(["2"]));
});

describe("filterEvents", () => {
  const event = (over: Partial<AdminEvent>): AdminEvent => ({
    id: "e",
    kind: "roll",
    at: "",
    team: "A",
    who: "Zorg",
    text: "1d20 → 4",
    secret: false,
    ...over,
  });
  const list = [
    event({ id: "1" }),
    event({ id: "2", kind: "message", team: "B", text: "salut" }),
    event({ id: "3", kind: "admin", team: "", who: "Sam", text: "Compte supprimé" }),
  ];
  const ids = (kind: EventFilter, team = "", q = "") =>
    filterEvents(list, kind, team, q).map((e) => e.id);
  it("combines kind, team and search", () => {
    expect(ids("all")).toEqual(["1", "2", "3"]);
    expect(ids("admin")).toEqual(["3"]);
    expect(ids("all", "B")).toEqual(["2"]);
    expect(ids("all", "", "SALUT")).toEqual(["2"]);
  });
});

describe("needsTeam", () => {
  it("only applies to game pages", () => {
    expect(needsTeam("/fiche")).toBe(true);
    expect(needsTeam("/mj/tableau")).toBe(true);
    expect(needsTeam("/equipes")).toBe(false);
    expect(needsTeam("/admin")).toBe(false);
    expect(needsTeam("/profil")).toBe(false);
  });
});
