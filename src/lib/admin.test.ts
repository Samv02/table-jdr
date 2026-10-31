import { describe, expect, it } from "vitest";
import {
  buildTodo,
  filterAccounts,
  filterEvents,
  filterTeams,
  groupByDay,
  logCategory,
  toCsv,
  trend,
  type AccountFilter,
  type EventQuery,
} from "./admin";
import { needsTeam, routeGuard } from "./team";
import type { AdminAccount, AdminEvent, AdminStats, AdminTeam } from "./admin.functions";

const account = (over: Partial<AdminAccount>): AdminAccount => ({
  id: "1",
  email: "a@b.fr",
  username: "Alex",
  created_at: "",
  last_sign_in_at: null,
  suspended: false,
  admin: false,
  note: "",
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
    rawId: "e",
    senderId: null,
    reviewed: false,
    kind: "roll",
    at: "2026-10-30T10:00:00.000Z",
    teamId: "a",
    team: "A",
    who: "Zorg",
    text: "",
    detail: "1d20 → 4",
    secret: false,
    ...over,
  });
  const list = [
    event({ id: "1" }),
    event({ id: "2", secret: true, teamId: "b" }),
    event({ id: "3", at: "2026-10-01T10:00:00.000Z" }),
    event({ id: "4", kind: "message", text: "salut" }),
    event({ id: "5", kind: "admin", teamId: null, text: "Fiche supprimée" }),
    event({ id: "6", kind: "admin", teamId: null, text: "Compte créé" }),
  ];
  const query = (over: Partial<EventQuery>): EventQuery => ({
    kind: "roll",
    teamId: "",
    days: 0,
    visibility: "all",
    category: "all",
    search: "",
    now: Date.parse("2026-10-30T12:00:00.000Z"),
    ...over,
  });
  const ids = (over: Partial<EventQuery>) => filterEvents(list, query(over)).map((e) => e.id);
  it("never mixes kinds", () => {
    expect(ids({})).toEqual(["1", "2", "3"]);
    expect(ids({ kind: "message" })).toEqual(["4"]);
  });
  it("filters by team, period and visibility", () => {
    expect(ids({ teamId: "b" })).toEqual(["2"]);
    expect(ids({ days: 7 })).toEqual(["1", "2"]);
    expect(ids({ visibility: "private" })).toEqual(["2"]);
  });
  it("filters the journal by family", () =>
    expect(ids({ kind: "admin", category: "fiches" })).toEqual(["5"]));
  it("searches, ignoring case", () =>
    expect(ids({ kind: "message", search: "SALUT" })).toEqual(["4"]));
  it("groups a sorted list by day", () => {
    const groups = groupByDay(filterEvents(list, query({})));
    expect(groups.map((g) => g.events.length)).toEqual([2, 1]);
  });
});

describe("logCategory", () => {
  it("sorts actions into families", () => {
    expect(logCategory("Compte suspendu")).toBe("comptes");
    expect(logCategory("Mot de passe provisoire défini")).toBe("comptes");
    expect(logCategory("Rôle MJ donné")).toBe("equipes");
    expect(logCategory("Code d’invitation changé")).toBe("equipes");
    expect(logCategory("Fiche réattribuée")).toBe("fiches");
    expect(logCategory("Réponse au support")).toBe("support");
    expect(logCategory("Annonce publiée")).toBe("reglages");
  });
});

describe("filterTeams", () => {
  const team = (over: Partial<AdminTeam>): AdminTeam => ({
    id: "t",
    name: "T",
    join_code: "ABC",
    created_at: "",
    owner: null,
    members: [{ user_id: "u", username: "x", role: "gm" }],
    characters: [],
    last_activity: null,
    rolls7d: 1,
    messages7d: 0,
    ...over,
  });
  const list = [
    team({ id: "1" }),
    team({ id: "2", members: [] }),
    team({ id: "3", members: [{ user_id: "u", username: "y", role: "player" }] }),
    team({ id: "4", rolls7d: 0 }),
  ];
  const ids = (f: Parameters<typeof filterTeams>[2]) => filterTeams(list, "", f).map((t) => t.id);
  it("finds teams needing attention", () => {
    expect(ids("empty")).toEqual(["2"]);
    expect(ids("noGm")).toEqual(["3"]);
    expect(ids("inactive")).toEqual(["4"]);
  });
});

describe("indicators", () => {
  it("gives no trend from zero", () => {
    expect(trend(5, 0)).toBeNull();
    expect(trend(15, 10)).toBe(50);
    expect(trend(5, 10)).toBe(-50);
  });
  it("lists only what needs action, tickets first", () => {
    const stats = { ticketsOpen: 2, noGmTeams: 0, emptyTeams: 1 } as AdminStats;
    expect(buildTodo({ stats }).map((t) => t.key)).toEqual(["open", "empty"]);
  });
  it("makes spreadsheet-safe CSV", () => {
    const csv = toCsv([["a;b", "=SUM(1)", null, 'dit "oui"']]);
    expect(csv.slice(1)).toBe(`"a;b";'=SUM(1);;"dit ""oui"""`);
  });
});

describe("routeGuard", () => {
  const nobody = { ready: true, userId: null, teamId: null, isGm: false, isAdmin: false };
  const player = { ...nobody, userId: "u", teamId: "t" };
  const gm = { ...player, isGm: true };
  const admin = { ...nobody, userId: "a", isAdmin: true };
  it("waits until the account is known", () =>
    expect(routeGuard("/mj/tableau", { ...nobody, ready: false })).toBeNull());
  it("sends logged-out visitors to the login page", () => {
    for (const page of [
      "/mj/tableau",
      "/mj/personnages",
      "/fiche",
      "/profil",
      "/support",
      "/admin",
    ])
      expect(routeGuard(page, nobody)).toBe("/");
    expect(routeGuard("/", nobody)).toBeNull();
    expect(routeGuard("/confidentialite", nobody)).toBeNull();
  });
  it("never leaves a player on a GM or admin page", () => {
    expect(routeGuard("/mj/tableau", player)).toBe("/fiche");
    expect(routeGuard("/mj/personnages", player)).toBe("/fiche");
    expect(routeGuard("/admin", player)).toBe("/fiche");
    expect(routeGuard("/fiche", player)).toBeNull();
  });
  it("sends a member without an open team to the team choice", () => {
    const free = { ...nobody, userId: "u" };
    expect(routeGuard("/mj/tableau", free)).toBe("/tables");
    expect(routeGuard("/admin", free)).toBe("/tables");
    expect(routeGuard("/tables", free)).toBeNull();
  });
  it("lets the GM and the admin in", () => {
    expect(routeGuard("/mj/tableau", gm)).toBeNull();
    expect(routeGuard("/admin", admin)).toBeNull();
    expect(routeGuard("/tables", admin)).toBe("/admin");
    expect(routeGuard("/mj/tableau", admin)).toBe("/admin");
    expect(routeGuard("/mj/tableau", { ...admin, teamId: "t", isGm: true })).toBeNull();
  });
});

describe("needsTeam", () => {
  it("only applies to game pages", () => {
    expect(needsTeam("/fiche")).toBe(true);
    expect(needsTeam("/mj/tableau")).toBe(true);
    expect(needsTeam("/tables")).toBe(false);
    expect(needsTeam("/admin")).toBe(false);
    expect(needsTeam("/profil")).toBe(false);
  });
});
