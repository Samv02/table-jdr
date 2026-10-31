import type { AdminAccount, AdminEvent, AdminOverview, AdminTeam } from "./admin.functions";

export const formatDay = (iso: string) => new Date(iso).toLocaleDateString("fr-FR");
export const formatMoment = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

export type AccountFilter = "all" | "suspended" | "admin" | "noTeam" | "neverSignedIn";
export type TeamFilter = "all" | "empty" | "noGm" | "inactive";
export type EventKind = AdminEvent["kind"];
export type EventVisibility = "all" | "public" | "private" | "flagged";
export type LogCategory = "all" | "comptes" | "equipes" | "fiches" | "support" | "reglages";

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
    if (filter === "neverSignedIn" && a.last_sign_in_at) return false;
    return (
      !q ||
      [a.username, a.email, ...a.teams.map((t) => t.name)].some((x) => x?.toLowerCase().includes(q))
    );
  });
}

export function filterTeams(teams: AdminTeam[], search: string, filter: TeamFilter = "all") {
  const q = search.trim().toLowerCase();
  return teams.filter((t) => {
    if (filter === "empty" && t.members.length > 0) return false;
    if (filter === "noGm" && (t.members.length === 0 || t.members.some((m) => m.role === "gm")))
      return false;
    if (filter === "inactive" && t.rolls7d + t.messages7d > 0) return false;
    return (
      !q ||
      t.name.toLowerCase().includes(q) ||
      t.join_code.toLowerCase().includes(q) ||
      t.members.some((m) => m.username?.toLowerCase().includes(q))
    );
  });
}

/** Famille d'une ligne du journal, déduite de son action. */
export function logCategory(action: string): Exclude<LogCategory, "all"> {
  if (/ticket|support/i.test(action)) return "support";
  if (/fiche/i.test(action)) return "fiches";
  if (/réglage|annonce|modération/i.test(action)) return "reglages";
  if (/table|code|membre|rôle|jets vidés|messages vidés|message supprimé/i.test(action))
    return "equipes";
  return "comptes";
}

export type EventQuery = {
  kind: EventKind;
  teamId: string;
  days: number;
  visibility: EventVisibility;
  category: LogCategory;
  search: string;
  now: number;
};

export function filterEvents(events: AdminEvent[], q: EventQuery) {
  const text = q.search.trim().toLowerCase();
  const since = q.days ? new Date(q.now - q.days * 86400000).toISOString() : "";
  return events.filter(
    (e) =>
      e.kind === q.kind &&
      (!q.teamId || e.teamId === q.teamId) &&
      e.at >= since &&
      (q.visibility === "all" ||
        q.visibility === "flagged" ||
        e.secret === (q.visibility === "private")) &&
      (q.category === "all" || logCategory(e.text) === q.category) &&
      (!text || `${e.who} ${e.text} ${e.detail}`.toLowerCase().includes(text)),
  );
}

/** Regroupe une liste déjà triée par jour, le plus récent d'abord. */
export function groupByDay(events: AdminEvent[]) {
  const groups: { day: string; events: AdminEvent[] }[] = [];
  for (const e of events) {
    const day = new Date(e.at).toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    const last = groups[groups.length - 1];
    if (last?.day === day) last.events.push(e);
    else groups.push({ day, events: [e] });
  }
  return groups;
}

/** Évolution en % par rapport à la période d'avant ; rien à afficher si elle était à zéro. */
export function trend(current: number, previous: number): number | null {
  return previous === 0 ? null : Math.round(((current - previous) / previous) * 100);
}

export const percent = (part: number, total: number) =>
  total === 0 ? 0 : Math.round((part / total) * 100);

export type TodoItem = {
  key: string;
  label: string;
  count: number;
  go: {
    tab: "support" | "comptes" | "equipes" | "activite";
    filter?: AccountFilter | TeamFilter;
  };
};

/** Ce qui demande une action, du plus urgent au moins urgent ; les lignes à zéro disparaissent. */
export function buildTodo({ stats: s }: Pick<AdminOverview, "stats">): TodoItem[] {
  const items: TodoItem[] = [
    {
      key: "flagged",
      label: "Messages signalés",
      count: s.flaggedMessages,
      go: { tab: "activite" },
    },
    { key: "open", label: "Tickets sans réponse", count: s.ticketsOpen, go: { tab: "support" } },
    {
      key: "noGm",
      label: "Tables sans MJ",
      count: s.noGmTeams,
      go: { tab: "equipes", filter: "noGm" },
    },
    {
      key: "empty",
      label: "Tables vides",
      count: s.emptyTeams,
      go: { tab: "equipes", filter: "empty" },
    },
    {
      key: "suspended",
      label: "Comptes suspendus",
      count: s.suspended,
      go: { tab: "comptes", filter: "suspended" },
    },
    {
      key: "noTeam",
      label: "Comptes sans table",
      count: s.noTeam,
      go: { tab: "comptes", filter: "noTeam" },
    },
    {
      key: "never",
      label: "Comptes jamais connectés",
      count: s.neverSignedIn,
      go: { tab: "comptes", filter: "neverSignedIn" },
    },
  ];
  return items.filter((i) => i.count > 0);
}

/** Tableau → CSV lisible par Excel (séparateur « ; » et marque UTF-8). */
export function toCsv(rows: (string | number | null)[][]) {
  const cell = (v: string | number | null) => {
    const text = String(v ?? "");
    // Un début de cellule en = + - @ serait exécuté comme formule par le tableur
    const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return /[;"\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
  };
  return `\uFEFF${rows.map((r) => r.map(cell).join(";")).join("\r\n")}`;
}

export function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
