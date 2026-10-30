export const TICKET_CATEGORIES = [
  { key: "question", label: "Question" },
  { key: "compte", label: "Mon compte" },
  { key: "bug", label: "Un bug" },
  { key: "autre", label: "Autre" },
] as const;
export const TICKET_STATUSES = [
  { key: "open", label: "Ouvert" },
  { key: "in_progress", label: "En cours" },
  { key: "resolved", label: "Traité" },
] as const;
export const TICKET_PRIORITIES = [
  { key: "low", label: "Basse" },
  { key: "normal", label: "Normale" },
  { key: "high", label: "Haute" },
] as const;

const labelOf = (list: readonly { key: string; label: string }[], key: string) =>
  list.find((x) => x.key === key)?.label ?? key;
export const categoryLabel = (key: string) => labelOf(TICKET_CATEGORIES, key);
export const statusLabel = (key: string) => labelOf(TICKET_STATUSES, key);
export const priorityLabel = (key: string) => labelOf(TICKET_PRIORITIES, key);

export function validateTicket(subject: string, body: string): string | null {
  if (subject.trim().length < 3) return "Donne un titre à ta demande.";
  if (!body.trim()) return "Décris ton problème.";
  return null;
}

const PRIORITY_ORDER: Record<string, number> = { high: 0, normal: 1, low: 2 };

/** File du support : d'abord ceux qui attendent une réponse, puis par priorité, le plus ancien avant. */
export function sortTickets<T extends { awaiting: boolean; priority: string; updated_at: string }>(
  tickets: T[],
) {
  return [...tickets].sort(
    (a, b) =>
      Number(b.awaiting) - Number(a.awaiting) ||
      (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1) ||
      a.updated_at.localeCompare(b.updated_at),
  );
}
