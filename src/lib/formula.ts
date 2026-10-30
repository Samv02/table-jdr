/**
 * Petites formules de règles, écrites par le MJ dans la page « Univers ».
 *
 *   10 + 5*ceil((CORPS+VOL)/2)        PV de Cyberpunk RED
 *   floor((STAT-10)/2) + NIV          base de compétence façon d20
 *   1 + (CORPS>=5) + (CORPS>=7)       une comparaison vaut 1 (vrai) ou 0 (faux)
 *
 * Autorisé : nombres, noms (caractéristiques, variables), + - * / %, parenthèses,
 * comparaisons (< <= > >= == !=) et les fonctions ceil, floor, round, min, max, abs.
 * Aucune évaluation de code JavaScript : le texte est analysé caractère par caractère.
 */

/** Clé de variable : majuscules, sans accents ni espaces (« Volonté » → « VOLONTE ») */
export const varKey = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "");

type Tok =
  | { t: "num"; v: number }
  | { t: "id"; v: string }
  | { t: "op"; v: string }
  | { t: "("; v: "(" }
  | { t: ")"; v: ")" }
  | { t: ","; v: "," };

const FUNCS: Record<string, (...a: number[]) => number> = {
  CEIL: (x = 0) => Math.ceil(x),
  FLOOR: (x = 0) => Math.floor(x),
  ROUND: (x = 0) => Math.round(x),
  ABS: (x = 0) => Math.abs(x),
  MIN: (...a) => (a.length ? Math.min(...a) : 0),
  MAX: (...a) => (a.length ? Math.max(...a) : 0),
};

class FormulaError extends Error {}

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j]!)) j++;
      const v = Number(src.slice(i, j));
      if (!Number.isFinite(v)) throw new FormulaError(`Nombre illisible : « ${src.slice(i, j)} »`);
      out.push({ t: "num", v });
      i = j;
      continue;
    }
    if (/[\p{L}_]/u.test(c)) {
      let j = i;
      while (j < src.length && /[\p{L}\p{N}_]/u.test(src[j]!)) j++;
      out.push({ t: "id", v: varKey(src.slice(i, j)) });
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (["<=", ">=", "==", "!="].includes(two)) {
      out.push({ t: "op", v: two });
      i += 2;
      continue;
    }
    if ("+-*/%<>".includes(c)) {
      out.push({ t: "op", v: c === "−" ? "-" : c });
      i++;
      continue;
    }
    if (c === "−") {
      out.push({ t: "op", v: "-" });
      i++;
      continue;
    }
    if (c === "×") {
      out.push({ t: "op", v: "*" });
      i++;
      continue;
    }
    if (c === "(" || c === ")" || c === ",") {
      out.push({ t: c, v: c } as Tok);
      i++;
      continue;
    }
    throw new FormulaError(`Caractère interdit : « ${c} »`);
  }
  return out;
}

type Node =
  | { k: "num"; v: number }
  | { k: "var"; name: string }
  | { k: "neg"; a: Node }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "call"; fn: string; args: Node[] };

function parse(tokens: Tok[]): Node {
  let p = 0;
  const peek = () => tokens[p];
  const eat = (t: Tok["t"], v?: string) => {
    const tok = tokens[p];
    if (!tok || tok.t !== t || (v !== undefined && tok.v !== v))
      throw new FormulaError("Formule incomplète ou mal parenthésée");
    p++;
    return tok;
  };
  const isOp = (...ops: string[]) => {
    const tok = peek();
    return tok?.t === "op" && ops.includes(tok.v);
  };
  function comparison(): Node {
    let a = additive();
    while (isOp("<", "<=", ">", ">=", "==", "!=")) {
      const op = (eat("op") as { v: string }).v;
      a = { k: "bin", op, a, b: additive() };
    }
    return a;
  }
  function additive(): Node {
    let a = term();
    while (isOp("+", "-")) {
      const op = (eat("op") as { v: string }).v;
      a = { k: "bin", op, a, b: term() };
    }
    return a;
  }
  function term(): Node {
    let a = unary();
    while (isOp("*", "/", "%")) {
      const op = (eat("op") as { v: string }).v;
      a = { k: "bin", op, a, b: unary() };
    }
    return a;
  }
  function unary(): Node {
    if (isOp("-")) {
      eat("op");
      return { k: "neg", a: unary() };
    }
    if (isOp("+")) {
      eat("op");
      return unary();
    }
    return primary();
  }
  function primary(): Node {
    const tok = peek();
    if (!tok) throw new FormulaError("Formule incomplète");
    if (tok.t === "num") {
      p++;
      return { k: "num", v: tok.v };
    }
    if (tok.t === "(") {
      eat("(");
      const e = comparison();
      eat(")");
      return e;
    }
    if (tok.t === "id") {
      p++;
      if (peek()?.t === "(") {
        if (!FUNCS[tok.v]) throw new FormulaError(`Fonction inconnue : ${tok.v.toLowerCase()}`);
        eat("(");
        const args: Node[] = [];
        if (peek()?.t !== ")") {
          args.push(comparison());
          while (peek()?.t === ",") {
            eat(",");
            args.push(comparison());
          }
        }
        eat(")");
        return { k: "call", fn: tok.v, args };
      }
      return { k: "var", name: tok.v };
    }
    throw new FormulaError("Formule mal construite");
  }
  const tree = comparison();
  if (p !== tokens.length) throw new FormulaError("Formule mal construite (élément en trop)");
  return tree;
}

function run(n: Node, vars: Record<string, number>, unknown: Set<string>): number {
  switch (n.k) {
    case "num":
      return n.v;
    case "var": {
      const v = vars[n.name];
      if (v === undefined) {
        unknown.add(n.name);
        return 0;
      }
      return v;
    }
    case "neg":
      return -run(n.a, vars, unknown);
    case "call":
      return FUNCS[n.fn]!(...n.args.map((a) => run(a, vars, unknown)));
    case "bin": {
      const a = run(n.a, vars, unknown);
      const b = run(n.b, vars, unknown);
      switch (n.op) {
        case "+":
          return a + b;
        case "-":
          return a - b;
        case "*":
          return a * b;
        case "/":
          return b === 0 ? 0 : a / b;
        case "%":
          return b === 0 ? 0 : a % b;
        case "<":
          return a < b ? 1 : 0;
        case "<=":
          return a <= b ? 1 : 0;
        case ">":
          return a > b ? 1 : 0;
        case ">=":
          return a >= b ? 1 : 0;
        case "==":
          return a === b ? 1 : 0;
        case "!=":
          return a !== b ? 1 : 0;
      }
    }
  }
  return 0;
}

const cache = new Map<string, Node | FormulaError>();
function compile(src: string): Node {
  let c = cache.get(src);
  if (!c) {
    try {
      c = parse(tokenize(src));
    } catch (e) {
      c = e instanceof FormulaError ? e : new FormulaError("Formule illisible");
    }
    if (cache.size > 500) cache.clear();
    cache.set(src, c);
  }
  if (c instanceof FormulaError) throw c;
  return c;
}

/** Calcule une formule. Variables inconnues = 0. Formule vide ou invalide → `fallback`. Résultat entier (arrondi). */
export function evalFormula(
  src: string | null | undefined,
  vars: Record<string, number>,
  fallback = 0,
): number {
  if (!src || !src.trim()) return fallback;
  try {
    const v = run(compile(src), vars, new Set());
    return Number.isFinite(v) ? Math.round(v) : fallback;
  } catch {
    return fallback;
  }
}

/** Vérifie une formule pour la page Univers : message d'erreur en français, ou null si elle est bonne. */
export function checkFormula(src: string, known: string[]): string | null {
  if (!src.trim()) return null;
  if (src.length > 200) return "Formule trop longue (200 caractères max).";
  try {
    const unknown = new Set<string>();
    run(compile(src), Object.fromEntries(known.map((k) => [varKey(k), 1])), unknown);
    if (unknown.size) return `Nom inconnu : ${[...unknown].join(", ")}`;
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Formule illisible";
  }
}
