export const MODERATION_CATEGORIES = [
  { key: "haine", label: "Haine" },
  { key: "menace", label: "Menace" },
  { key: "danger", label: "Personne en danger" },
  { key: "sexuel", label: "Sexuel" },
  { key: "insulte", label: "Insulte" },
  { key: "arnaque", label: "Arnaque" },
] as const;

export type ModerationWord = { id: string; word: string; category: string };
export type FlagMatch = { start: number; end: number; word: string; category: string };

export const categoryName = (key: string) =>
  MODERATION_CATEGORIES.find((c) => c.key === key)?.label ?? key;

const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
};

/** Sans accents ni chiffres-lettres, caractère par caractère : les positions restent celles du texte. */
function normalize(text: string) {
  return [...text]
    .map((c) => {
      const plain = c.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
      return plain.length === 1 ? (LEET[plain] ?? plain) : c;
    })
    .join("");
}

const escape = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** « con » trouve « connnn » ou « c.o.n », sans se déclencher au milieu d'un autre mot. */
function toPattern(word: string) {
  const open = word.endsWith("*");
  const parts = normalize(open ? word.slice(0, -1) : word)
    .trim()
    .split(/\s+/)
    .map((part) => [...part].map((c) => `${escape(c)}+`).join("[.\\-_*]?"));
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${parts.join("[\\s'’\\-]+")}${open ? "[\\p{L}\\p{N}]*" : "(?![\\p{L}\\p{N}])"}`,
    "gu",
  );
}

/** Mots de la liste trouvés dans un texte, triés par position, sans chevauchement. */
export function findFlags(text: string, words: ModerationWord[]): FlagMatch[] {
  const clean = normalize(text);
  const found: FlagMatch[] = [];
  for (const w of words) {
    for (const m of clean.matchAll(toPattern(w.word))) {
      found.push({
        start: m.index,
        end: m.index + m[0].length,
        word: w.word,
        category: w.category,
      });
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  return found.filter((f, i) => !found.slice(0, i).some((p) => f.start < p.end && p.start < f.end));
}

/** Découpe un texte en morceaux à surligner ou non. */
export function splitFlags(text: string, flags: FlagMatch[]) {
  const parts: { text: string; flagged: boolean }[] = [];
  let at = 0;
  for (const f of flags) {
    if (f.start > at) parts.push({ text: text.slice(at, f.start), flagged: false });
    parts.push({ text: text.slice(f.start, f.end), flagged: true });
    at = f.end;
  }
  if (at < text.length) parts.push({ text: text.slice(at), flagged: false });
  return parts;
}
