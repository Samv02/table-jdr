/**
 * Assistant de formules : des phrases à trous pour les cas courants, traduites vers le langage
 * de formula.ts et relues depuis lui. Ce qui ne rentre dans aucune phrase reste une formule libre.
 */
export type FormulaVar = { code: string; label: string };
export type Rounding = "ceil" | "floor" | "round";

export type Recipe =
  | { kind: "none" }
  | { kind: "fixed"; value: number }
  | { kind: "one"; base: number; mul: number; a: string }
  | { kind: "fraction"; base: number; mul: number; a: string; div: number; round: Rounding }
  | { kind: "average"; base: number; mul: number; a: string; b: string; round: Rounding }
  | { kind: "sum"; a: string; b: string; base: number }
  | { kind: "tiers"; base: number; a: string; steps: number[] };

export const RECIPE_KINDS = [
  { key: "fixed", label: "Un nombre fixe" },
  { key: "one", label: "Une caractéristique" },
  { key: "fraction", label: "Une fraction de caractéristique" },
  { key: "average", label: "La moyenne de deux caractéristiques" },
  { key: "sum", label: "Deux valeurs additionnées" },
  { key: "tiers", label: "Des paliers" },
] as const;
export type RecipeKind = (typeof RECIPE_KINDS)[number]["key"];

export const ROUNDINGS: { key: Rounding; label: string }[] = [
  { key: "ceil", label: "au-dessus" },
  { key: "floor", label: "en dessous" },
  { key: "round", label: "au plus proche" },
];

const start = (base: number, mul: number) =>
  `${base ? `${base} + ` : ""}${mul !== 1 ? `${mul}*` : ""}`;

export function buildFormula(r: Recipe): string {
  switch (r.kind) {
    case "none":
      return "";
    case "fixed":
      return String(r.value);
    case "one":
      return `${start(r.base, r.mul)}${r.a}`;
    case "fraction":
      return `${start(r.base, r.mul)}${r.round}(${r.a}/${r.div})`;
    case "average":
      return `${start(r.base, r.mul)}${r.round}((${r.a}+${r.b})/2)`;
    case "sum":
      return `${r.a} + ${r.b}${r.base ? ` + ${r.base}` : ""}`;
    case "tiers":
      return [String(r.base), ...r.steps.map((s) => `(${r.a}>=${s})`)].join(" + ");
  }
}

const n = (v: string | undefined, fallback: number) => (v === undefined ? fallback : Number(v));
const V = "([A-Za-z_][A-Za-z0-9_]*)";
const HEAD = "(?:(\\d+)\\+)?(?:(\\d+)\\*)?";

/** Relit une formule en phrase à trous ; null si elle n'y rentre pas (formule libre). */
export function parseFormula(src: string, known: string[]): Recipe | null {
  const s = src.replace(/\s+/g, "");
  if (!s) return { kind: "none" };
  const has = (...codes: (string | undefined)[]) =>
    codes.every((c) => c !== undefined && known.includes(c));
  if (/^\d+$/.test(s)) return { kind: "fixed", value: Number(s) };

  const tiers = s.match(new RegExp(`^(\\d+)((?:\\+\\(${V}>=\\d+\\))+)$`));
  if (tiers) {
    const parts = [...(tiers[2] ?? "").matchAll(new RegExp(`\\(${V}>=(\\d+)\\)`, "g"))];
    const a = parts[0]?.[1];
    if (has(a) && parts.every((p) => p[1] === a))
      return {
        kind: "tiers",
        base: Number(tiers[1]),
        a: a as string,
        steps: parts.map((p) => Number(p[2])),
      };
  }
  let m = s.match(new RegExp(`^${HEAD}(ceil|floor|round)\\(\\(${V}\\+${V}\\)/2\\)$`, "i"));
  if (m && has(m[4], m[5]))
    return {
      kind: "average",
      base: n(m[1], 0),
      mul: n(m[2], 1),
      round: (m[3] ?? "ceil").toLowerCase() as Rounding,
      a: m[4] as string,
      b: m[5] as string,
    };
  m = s.match(new RegExp(`^${HEAD}(ceil|floor|round)\\(${V}/(\\d+)\\)$`, "i"));
  if (m && has(m[4]) && Number(m[5]) > 0)
    return {
      kind: "fraction",
      base: n(m[1], 0),
      mul: n(m[2], 1),
      round: (m[3] ?? "ceil").toLowerCase() as Rounding,
      a: m[4] as string,
      div: Number(m[5]),
    };
  m = s.match(new RegExp(`^${HEAD}${V}$`));
  if (m && has(m[3])) return { kind: "one", base: n(m[1], 0), mul: n(m[2], 1), a: m[3] as string };
  m = s.match(new RegExp(`^(?:(\\d+)\\+)?${V}\\*(\\d+)$`));
  if (m && has(m[2]))
    return { kind: "one", base: n(m[1], 0), mul: Number(m[3]), a: m[2] as string };
  m = s.match(new RegExp(`^${V}\\+${V}(?:\\+(\\d+))?$`));
  if (m && has(m[1], m[2]))
    return { kind: "sum", a: m[1] as string, b: m[2] as string, base: n(m[3], 0) };
  return null;
}

/** Point de départ quand le MJ choisit une phrase. */
export function newRecipe(kind: RecipeKind, vars: FormulaVar[]): Recipe {
  const a = vars[0]?.code ?? "";
  const b = vars[1]?.code ?? a;
  switch (kind) {
    case "fixed":
      return { kind, value: 10 };
    case "one":
      return { kind, base: 0, mul: 1, a };
    case "fraction":
      return { kind, base: 0, mul: 1, a, div: 2, round: "ceil" };
    case "average":
      return { kind, base: 0, mul: 1, a, b, round: "ceil" };
    case "sum":
      return { kind, a, b, base: 0 };
    case "tiers":
      return { kind, base: 1, a, steps: [5, 7, 11] };
  }
}

const roundWord = (r: Rounding) => ROUNDINGS.find((x) => x.key === r)?.label ?? "";

/** Traduit une formule en français, avec les noms affichés. */
export function describeFormula(src: string, vars: FormulaVar[], emptyLabel = "Vide"): string {
  const name = (code: string) => vars.find((v) => v.code === code)?.label ?? code;
  const lead = (base: number, mul: number) =>
    `${base ? `${base} + ` : ""}${mul !== 1 ? `${mul} × ` : ""}`;
  const r = parseFormula(
    src,
    vars.map((v) => v.code),
  );
  switch (r?.kind) {
    case "none":
      return emptyLabel;
    case "fixed":
      return `Toujours ${r.value}`;
    case "one":
      return `${lead(r.base, r.mul)}${name(r.a)}`;
    case "fraction":
      return `${lead(r.base, r.mul)}${name(r.a)} ÷ ${r.div}, arrondi ${roundWord(r.round)}`;
    case "average":
      return `${lead(r.base, r.mul)}moyenne de ${name(r.a)} et ${name(r.b)}, arrondie ${roundWord(r.round)}`;
    case "sum":
      return `${name(r.a)} + ${name(r.b)}${r.base ? ` + ${r.base}` : ""}`;
    case "tiers":
      return `${r.base}, +1 pour chaque palier de ${name(r.a)} : ${r.steps.join(", ")}`;
    default: {
      let text = src
        .replace(/\bceil\(/gi, "arrondi au-dessus(")
        .replace(/\bfloor\(/gi, "arrondi en dessous(")
        .replace(/\bround\(/gi, "arrondi(")
        .replace(/\*/g, " × ")
        .replace(/\//g, " ÷ ")
        .replace(/>=/g, " ≥ ")
        .replace(/<=/g, " ≤ ");
      for (const v of vars) text = text.replace(new RegExp(`\\b${v.code}\\b`, "g"), v.label);
      return text.replace(/\s+/g, " ").trim();
    }
  }
}
