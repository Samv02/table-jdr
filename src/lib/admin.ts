import type { AdminAccount, AdminEvent } from "./admin.functions";

export const formatDay = (iso: string) => new Date(iso).toLocaleDateString("fr-FR");
export const formatMoment = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

export type AccountFilter = "all" | "suspended" | "admin" | "noTeam";
export type EventFilter = "all" | AdminEvent["kind"];

/** Recherche du back office : pseudo, e-mail ou nom d'équipe, sans tenir compte de la casse. */
export function filterAccounts(
  accounts: AdminAccount[],
  search: string,
  filter: AccountFilter = "all",
) {
  const q = search.trim().toLowerCase();
  return accounts.filter((a) => {
    if (filter === "suspended" && !a.suspended) return false;
    if (filter === "admin" && !a.admin) return false;
    if (filter === "noTeam" && (a.admin || a.teams.length > 0)) return false;
    return (
      !q ||
      [a.username, a.email, ...a.teams.map((t) => t.name)].some((x) => x?.toLowerCase().includes(q))
    );
  });
}

export function filterEvents(
  events: AdminEvent[],
  kind: EventFilter,
  team: string,
  search: string,
) {
  const q = search.trim().toLowerCase();
  return events.filter(
    (e) =>
      (kind === "all" || e.kind === kind) &&
      (!team || e.team === team) &&
      (!q || `${e.who} ${e.text}`.toLowerCase().includes(q)),
  );
}
