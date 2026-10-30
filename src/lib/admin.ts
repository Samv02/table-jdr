import type { AdminAccount } from "./admin.functions";

export const formatDay = (iso: string) => new Date(iso).toLocaleDateString("fr-FR");
export const formatMoment = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

/** Recherche du back office : pseudo, e-mail ou nom d'équipe, sans tenir compte de la casse. */
export function filterAccounts(accounts: AdminAccount[], search: string) {
  const q = search.trim().toLowerCase();
  if (!q) return accounts;
  return accounts.filter((a) =>
    [a.username, a.email, ...a.teams.map((t) => t.name)].some((x) => x?.toLowerCase().includes(q)),
  );
}
