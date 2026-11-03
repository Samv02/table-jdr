import { useState } from "react";
import { Button } from "@/components/ui/button";

// Édition des particularités (cyberware, dons…) en puces : la donnée reste une ligne par élément.
export function FeatureEditor({
  value,
  label,
  onChange,
}: {
  value: string;
  label: string;
  onChange: (next: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [focus, setFocus] = useState<number | null>(null);
  const lines = value.split(/\r?\n/);
  const save = (next: string[]) => onChange(next.join("\n"));
  const remove = (i: number) => save(lines.filter((_, j) => j !== i));

  return (
    <div className="feature-edit">
      <div className="chips">
        {lines.map(
          (l, i) =>
            (l.trim() || i === focus) && (
              <span className="chip cut-s chip-edit" key={i}>
                <input
                  aria-label={`${label} ${i + 1}`}
                  value={l}
                  size={Math.max(l.length, 6)}
                  onFocus={() => setFocus(i)}
                  onBlur={() => {
                    setFocus(null);
                    if (!l.trim()) remove(i);
                  }}
                  onChange={(e) => save(lines.map((x, j) => (j === i ? e.target.value : x)))}
                />
                <Button className="x" aria-label={`Retirer ${l}`} onClick={() => remove(i)}>
                  ✕
                </Button>
              </span>
            ),
        )}
      </div>
      <form
        className="add"
        onSubmit={(e) => {
          e.preventDefault();
          const name = draft.trim();
          if (!name) return;
          save([...lines.filter((x) => x.trim()), name]);
          setDraft("");
        }}
      >
        <input
          className="field"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Nouvel élément"
          aria-label={`Ajouter : ${label}`}
        />
        <Button type="submit" className="btn y" disabled={!draft.trim()}>
          Ajouter
        </Button>
      </form>
    </div>
  );
}
