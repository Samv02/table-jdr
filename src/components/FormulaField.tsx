import { useRef, useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { evalFormula } from "@/lib/formula";
import {
  RECIPE_KINDS,
  ROUNDINGS,
  buildFormula,
  describeFormula,
  newRecipe,
  parseFormula,
  type FormulaVar,
  type Recipe,
  type RecipeKind,
  type Rounding,
} from "@/lib/formula-builder";

const OPERATORS = [
  ["+", " + "],
  ["−", " - "],
  ["×", "*"],
  ["÷", "/"],
  ["(", "("],
  [")", ")"],
  ["≥", ">="],
] as const;
const FUNCTIONS = [
  ["Arrondi au-dessus", "ceil("],
  ["Arrondi en dessous", "floor("],
  ["Le plus petit", "min("],
  ["Le plus grand", "max("],
] as const;
const FREE = "free";
const EMPTY = "none";

/**
 * Formule sans code : une phrase à trous pour les cas courants, un mode libre à boutons pour le
 * reste. Le résumé en français et l'exemple restent visibles pour vérifier d'un coup d'œil.
 */
export function FormulaField({
  label,
  hint,
  value,
  error,
  vars,
  emptyLabel,
  onChange,
}: {
  label: string;
  hint?: string | undefined;
  value: string;
  error?: string | undefined;
  vars: FormulaVar[];
  /** Si le champ peut rester vide : ce que ça signifie */
  emptyLabel?: string | undefined;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [freeMode, setFreeMode] = useState(false);
  const [sample, setSample] = useState(6);
  const input = useRef<HTMLInputElement>(null);
  const codes = vars.map((v) => v.code);
  const recipe = parseFormula(value, codes);
  const mode = freeMode || !recipe ? FREE : recipe.kind;
  const example = evalFormula(value, Object.fromEntries(codes.map((c) => [c, sample])));

  function insert(text: string) {
    const el = input.current;
    const from = el?.selectionStart ?? value.length;
    const to = el?.selectionEnd ?? value.length;
    onChange(`${value.slice(0, from)}${text}${value.slice(to)}`);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(from + text.length, from + text.length);
    });
  }
  function pick(next: string) {
    setFreeMode(next === FREE);
    if (next === FREE) return;
    onChange(next === EMPTY ? "" : buildFormula(newRecipe(next as RecipeKind, vars)));
  }
  const update = (next: Recipe) => onChange(buildFormula(next));

  return (
    <div className={`formula-field ${error ? "bad" : ""}`}>
      <div className="ff-head">
        <span className="ff-label">{label}</span>
        <Button
          className="icon-btn cut-s"
          aria-label={`${open ? "Fermer" : "Modifier"} ${label}`}
          aria-expanded={open}
          title={open ? "Fermer" : "Modifier"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X /> : <Pencil />}
        </Button>
      </div>
      <p className="ff-summary">{describeFormula(value, vars, emptyLabel ?? "Vide")}</p>
      {error && <small className="uni-err">{error}</small>}
      {open && (
        <div className="ff-editor">
          <select
            className="field"
            aria-label={`Type de calcul pour ${label}`}
            value={mode}
            onChange={(e) => pick(e.target.value)}
          >
            {emptyLabel && <option value={EMPTY}>{emptyLabel}</option>}
            {RECIPE_KINDS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
            <option value={FREE}>Formule libre</option>
          </select>
          {mode !== FREE && recipe && (
            <Sentence recipe={recipe} vars={vars} label={label} onChange={update} />
          )}
          {mode === FREE && (
            <>
              <input
                ref={input}
                className={`field mono ${error ? "bad" : ""}`}
                aria-label={`Formule de ${label}`}
                maxLength={200}
                spellCheck={false}
                value={value}
                onChange={(e) => onChange(e.target.value)}
              />
              <div className="ff-chips" aria-label="Valeurs à insérer">
                {vars.map((v) => (
                  <Button key={v.code} onClick={() => insert(v.code)}>
                    {v.label}
                  </Button>
                ))}
              </div>
              <div className="ff-chips ops" aria-label="Opérations à insérer">
                {OPERATORS.map(([text, code]) => (
                  <Button key={text} onClick={() => insert(code)}>
                    {text}
                  </Button>
                ))}
                {FUNCTIONS.map(([text, code]) => (
                  <Button key={text} onClick={() => insert(code)}>
                    {text}
                  </Button>
                ))}
              </div>
            </>
          )}
          {value.trim() !== "" && !error && (
            <label className="ff-example">
              Si tout vaut
              <input
                className="field"
                type="number"
                aria-label={`Valeur d’exemple pour ${label}`}
                value={sample}
                onChange={(e) => setSample(Number(e.target.value) || 0)}
              />
              <span>
                → résultat : <b>{example}</b>
              </span>
            </label>
          )}
        </div>
      )}
      {hint && !error && <small className="ff-hint">{hint}</small>}
    </div>
  );
}

function Num({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      className="field ff-num"
      type="number"
      min={0}
      aria-label={label}
      value={value}
      onChange={(e) => onChange(Math.max(0, Math.round(Number(e.target.value)) || 0))}
    />
  );
}

function Pick({
  label,
  value,
  vars,
  onChange,
}: {
  label: string;
  value: string;
  vars: FormulaVar[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      className="field ff-pick"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {vars.map((v) => (
        <option key={v.code} value={v.code}>
          {v.label}
        </option>
      ))}
    </select>
  );
}

function RoundPick({ value, onChange }: { value: Rounding; onChange: (v: Rounding) => void }) {
  return (
    <select
      className="field ff-pick"
      aria-label="Arrondi"
      value={value}
      onChange={(e) => onChange(e.target.value as Rounding)}
    >
      {ROUNDINGS.map((r) => (
        <option key={r.key} value={r.key}>
          {r.label}
        </option>
      ))}
    </select>
  );
}

/** Les trous de la phrase, un par valeur à choisir. */
function Sentence({
  recipe: r,
  vars,
  label,
  onChange,
}: {
  recipe: Recipe;
  vars: FormulaVar[];
  label: string;
  onChange: (next: Recipe) => void;
}) {
  if (r.kind === "none") return null;
  if (r.kind === "fixed")
    return (
      <div className="ff-sentence">
        <Num label="Nombre" value={r.value} onChange={(value) => onChange({ ...r, value })} />
      </div>
    );
  if (r.kind === "sum")
    return (
      <div className="ff-sentence">
        <Pick
          label="Première valeur"
          value={r.a}
          vars={vars}
          onChange={(a) => onChange({ ...r, a })}
        />
        <span>+</span>
        <Pick
          label="Deuxième valeur"
          value={r.b}
          vars={vars}
          onChange={(b) => onChange({ ...r, b })}
        />
        <span>+</span>
        <Num label="Bonus fixe" value={r.base} onChange={(base) => onChange({ ...r, base })} />
      </div>
    );
  if (r.kind === "tiers")
    return (
      <div className="ff-sentence">
        <span>Départ</span>
        <Num
          label="Valeur de départ"
          value={r.base}
          onChange={(base) => onChange({ ...r, base })}
        />
        <span>puis +1 à chaque palier de</span>
        <Pick
          label="Valeur des paliers"
          value={r.a}
          vars={vars}
          onChange={(a) => onChange({ ...r, a })}
        />
        <span>:</span>
        {r.steps.map((step, i) => (
          <span className="ff-step" key={i}>
            <Num
              label={`Palier ${i + 1}`}
              value={step}
              onChange={(v) => onChange({ ...r, steps: r.steps.map((s, j) => (j === i ? v : s)) })}
            />
            {r.steps.length > 1 && (
              <Button
                aria-label={`Retirer le palier ${i + 1}`}
                onClick={() => onChange({ ...r, steps: r.steps.filter((_, j) => j !== i) })}
              >
                <X size={12} aria-hidden="true" />
              </Button>
            )}
          </span>
        ))}
        <Button
          className="ff-add"
          aria-label={`Ajouter un palier à ${label}`}
          onClick={() => onChange({ ...r, steps: [...r.steps, (r.steps.at(-1) ?? 0) + 2] })}
        >
          <Plus size={14} aria-hidden="true" />
        </Button>
      </div>
    );
  return (
    <div className="ff-sentence">
      <Num label="Valeur de base" value={r.base} onChange={(base) => onChange({ ...r, base })} />
      <span>+</span>
      <Num
        label="Multiplicateur"
        value={r.mul}
        onChange={(mul) => onChange({ ...r, mul: mul || 1 })}
      />
      <span>×</span>
      {r.kind === "one" && (
        <Pick
          label="Caractéristique"
          value={r.a}
          vars={vars}
          onChange={(a) => onChange({ ...r, a })}
        />
      )}
      {r.kind === "fraction" && (
        <>
          <Pick
            label="Caractéristique"
            value={r.a}
            vars={vars}
            onChange={(a) => onChange({ ...r, a })}
          />
          <span>÷</span>
          <Num
            label="Diviseur"
            value={r.div}
            onChange={(div) => onChange({ ...r, div: div || 1 })}
          />
          <span>arrondi</span>
          <RoundPick value={r.round} onChange={(round) => onChange({ ...r, round })} />
        </>
      )}
      {r.kind === "average" && (
        <>
          <span>moyenne de</span>
          <Pick
            label="Première caractéristique"
            value={r.a}
            vars={vars}
            onChange={(a) => onChange({ ...r, a })}
          />
          <span>et</span>
          <Pick
            label="Deuxième caractéristique"
            value={r.b}
            vars={vars}
            onChange={(b) => onChange({ ...r, b })}
          />
          <span>arrondie</span>
          <RoundPick value={r.round} onChange={(round) => onChange({ ...r, round })} />
        </>
      )}
    </div>
  );
}
